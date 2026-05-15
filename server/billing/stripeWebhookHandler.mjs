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

      if (!customerId || !subscriptionId) {
        console.error(
          '[webhook/stripe] checkout.session.completed missing customer or subscription id; skipping sync',
        )
        return res.status(200).json({ received: true, skipped: 'missing_customer_or_subscription' })
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const result = await syncSubscriptionToUser({
        eventType: event.type,
        customerId,
        subscription,
        metadataUserId,
      })
      return respondStripeWebhookSync(res, event.type, result)
    }

    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const subscription = event.data.object
      const customerId = pickStripeId(subscription.customer)
      const metadataUserId =
        subscription.metadata && typeof subscription.metadata.userId === 'string'
          ? subscription.metadata.userId
          : null
      if (!customerId) {
        console.error('[webhook/stripe] subscription event missing customer id', event.type)
        return res.status(200).json({ received: true, skipped: 'missing_customer_id' })
      }

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

      const result = await syncSubscriptionToUser({
        eventType: event.type,
        customerId,
        subscription,
        metadataUserId,
      })
      return respondStripeWebhookSync(res, event.type, result)
    }

    if (
      event.type === 'invoice.paid' ||
      event.type === 'invoice.payment_succeeded' ||
      event.type === 'invoice.payment_failed'
    ) {
      const invoice = event.data.object
      const customerId = pickStripeId(invoice.customer)
      const subscriptionId = pickStripeId(invoice.subscription)
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

      if (!customerId || !subscriptionId) {
        console.error('[webhook/stripe] invoice event missing customer or subscription id')
        return res.status(200).json({ received: true, skipped: 'missing_customer_or_subscription' })
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)
      const result = await syncSubscriptionToUser({
        eventType: event.type,
        customerId,
        subscription,
        metadataUserId:
          subscription.metadata && typeof subscription.metadata.userId === 'string'
            ? subscription.metadata.userId
            : null,
      })
      return respondStripeWebhookSync(res, event.type, result)
    }
  } catch (err) {
    const message = typeof err?.message === 'string' ? err.message : 'webhook handling failed'
    console.error('[webhook/stripe] Handler EXCEPTION — returning 500 for Stripe retry:', message, err)
    return res.status(500).json({ received: false, handlerError: message })
  }

  console.log('[webhook/stripe] unhandled event type (noop):', event.type)
  return res.status(200).json({ received: true, unhandled: event.type })
}
