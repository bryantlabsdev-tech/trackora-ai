import { pickStripeId, syncSubscriptionToUser } from './sync.mjs'
import { isDuplicateStripeEvent } from './webhookIdempotency.mjs'

/**
 * @typedef {{
 *   stripe: import('stripe').default
 *   respondStripeWebhookSync: (res: import('express').Response, eventType: string, result: Awaited<ReturnType<typeof syncSubscriptionToUser>>) => import('express').Response
 * }} StripeWebhookDeps
 */

/**
 * Handle a verified Stripe webhook event (signature already checked).
 * @param {import('stripe').Stripe.Event} event
 * @param {import('express').Response} res
 * @param {StripeWebhookDeps} deps
 */
export async function handleStripeWebhookEvent(event, res, deps) {
  const { stripe, respondStripeWebhookSync } = deps

  /**
   * @param {string | null} customerId
   * @param {string | null} fallbackEmail
   * @returns {Promise<string | null>}
   */
  async function resolveCustomerEmail(customerId, fallbackEmail = null) {
    const fallback = typeof fallbackEmail === 'string' && fallbackEmail.trim() ? fallbackEmail.trim() : null
    if (fallback) return fallback
    if (!customerId) return null
    try {
      const customer = await stripe.customers.retrieve(customerId)
      if (customer && !('deleted' in customer) && typeof customer.email === 'string' && customer.email.trim()) {
        return customer.email.trim()
      }
    } catch (err) {
      const msg = typeof err?.message === 'string' ? err.message : 'unknown error'
      console.warn('[webhook/stripe] could not resolve customer email', { customerId, message: msg })
    }
    return null
  }

  /**
   * @param {string} eventType
   * @param {import('stripe').Stripe.Subscription} subscription
   * @param {string | null} metadataUserId
   * @param {string | null} hintEmail
   */
  async function syncFromSubscription(eventType, subscription, metadataUserId, hintEmail = null) {
    const customerId = pickStripeId(subscription.customer)
    const customerEmail = await resolveCustomerEmail(customerId, hintEmail)
    const result = await syncSubscriptionToUser({
      eventType,
      customerId,
      customerEmail,
      subscription,
      metadataUserId,
    })
    return respondStripeWebhookSync(res, eventType, result)
  }

  if (isDuplicateStripeEvent(event.id)) {
    console.log('[webhook/stripe] duplicate event id skipped', event.id, event.type)
    return res.status(200).json({ received: true, duplicate: true })
  }

  console.log('[webhook/stripe] event type:', event.type, 'id:', event.id)

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const customerId = pickStripeId(session.customer)
      const subscriptionId = pickStripeId(session.subscription)
      const metadataUserId =
        session.metadata && typeof session.metadata.userId === 'string'
          ? session.metadata.userId
          : null

      console.log('[webhook/stripe] checkout.session.completed', {
        sessionId: session.id,
        mode: session.mode ?? null,
        metadataUserId: metadataUserId ?? '(missing)',
        subscriptionId: subscriptionId ?? '(missing)',
      })

      if (session.mode && session.mode !== 'subscription') {
        console.warn('[webhook/stripe] checkout session mode is not subscription:', session.mode)
      }

      if (!subscriptionId) {
        console.error(
          '[webhook/stripe] checkout.session.completed missing subscription id; skipping sync',
        )
        return res.status(200).json({ received: true, skipped: 'missing_subscription' })
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const customerEmail =
        session.customer_details && typeof session.customer_details.email === 'string'
          ? session.customer_details.email
          : null
      return syncFromSubscription(event.type, subscription, metadataUserId, customerEmail)
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object
      const metadataUserId =
        subscription.metadata && typeof subscription.metadata.userId === 'string'
          ? subscription.metadata.userId
          : null

      if (event.type === 'customer.subscription.deleted') {
        console.log('[webhook/stripe] subscription deleted / ended', {
          subscriptionId: subscription.id,
          status: subscription.status ?? null,
        })
      }

      if (subscription.status === 'past_due') {
        console.warn('[webhook/stripe] subscription past_due — syncing is_pro=false (no grace)', {
          subscriptionId: subscription.id,
        })
      }

      return syncFromSubscription(event.type, subscription, metadataUserId)
    }

    if (
      event.type === 'invoice.paid' ||
      event.type === 'invoice.payment_succeeded' ||
      event.type === 'invoice.payment_failed'
    ) {
      const invoice = event.data.object
      const customerId = pickStripeId(invoice.customer)
      const subscriptionId = pickStripeId(invoice.subscription)
      const invoiceEmail =
        typeof invoice.customer_email === 'string' && invoice.customer_email.trim()
          ? invoice.customer_email.trim()
          : null
      const billingReason = typeof invoice.billing_reason === 'string' ? invoice.billing_reason : null

      const isPaidEvent = event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded'

      if (isPaidEvent && billingReason === 'subscription_cycle') {
        console.log('[webhook/stripe] RENEWAL invoice paid (subscription_cycle)', {
          eventType: event.type,
          invoiceId: invoice.id,
          subscriptionId,
          amountPaid: invoice.amount_paid ?? null,
        })
      } else if (!isPaidEvent) {
        console.warn('[webhook/stripe] invoice.payment_failed', {
          invoiceId: invoice.id,
          subscriptionId,
          billingReason,
        })
      }

      let resolvedSubscriptionId = subscriptionId
      if (!resolvedSubscriptionId && customerId) {
        try {
          const list = await stripe.subscriptions.list({
            customer: customerId,
            status: 'all',
            limit: 10,
          })
          const preferred = ['active', 'trialing', 'past_due', 'unpaid', 'canceled', 'incomplete_expired', 'incomplete']
          for (const status of preferred) {
            const hit = list.data.find((s) => s.status === status)
            if (hit?.id) {
              resolvedSubscriptionId = hit.id
              break
            }
          }
        } catch (err) {
          const msg = typeof err?.message === 'string' ? err.message : 'unknown error'
          console.error('[webhook/stripe] invoice fallback subscription list failed', {
            customerId,
            message: msg,
          })
        }
      }
      if (!resolvedSubscriptionId) {
        console.error('[webhook/stripe] invoice event missing subscription id after fallback lookup')
        return res.status(200).json({ received: true, skipped: 'missing_subscription' })
      }

      const subscription = await stripe.subscriptions.retrieve(resolvedSubscriptionId)
      const metadataUserId =
        subscription.metadata && typeof subscription.metadata.userId === 'string'
          ? subscription.metadata.userId
          : null
      return syncFromSubscription(event.type, subscription, metadataUserId, invoiceEmail)
    }
  } catch (err) {
    const message = typeof err?.message === 'string' ? err.message : 'webhook handling failed'
    console.error('[webhook/stripe] Handler EXCEPTION — returning 500 for Stripe retry:', message, err)
    return res.status(500).json({ received: false, handlerError: message })
  }

  console.log('[webhook/stripe] unhandled event type (noop):', event.type)
  return res.status(200).json({ received: true, unhandled: event.type })
}
