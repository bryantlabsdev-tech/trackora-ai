// Check Stripe itself: profile flags can lag behind a successful payment.
export async function findExistingBilling(stripe, profile, userId, email, priceIds = []) {
  const customerIds = new Set()
  if (profile.stripe_customer_id) customerIds.add(profile.stripe_customer_id)
  let linked = null
  if (profile.stripe_subscription_id) {
    linked = await stripe.subscriptions.retrieve(profile.stripe_subscription_id)
    const customer = typeof linked.customer === 'string' ? linked.customer : linked.customer?.id
    if (customer) customerIds.add(customer)
  }
  // Legacy checkout did not reuse a customer; find those subscriptions too.
  if (email) {
    for await (const customer of stripe.customers.list({ email, limit: 100 })) {
      if (!customer.metadata?.userId || customer.metadata.userId === userId) customerIds.add(customer.id)
    }
  }
  const subscriptions = new Map(linked ? [[linked.id, linked]] : [])
  // Account metadata also finds legacy payments made with a different billing email.
  if (stripe.subscriptions.search) {
    const safeUserId = userId.replace(/['\\]/g, '')
    for await (const sub of stripe.subscriptions.search({ query: `metadata['userId']:'${safeUserId}'`, limit: 100 })) {
      subscriptions.set(sub.id, sub)
      const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
      if (customer) customerIds.add(customer)
    }
  }
  for (const customer of customerIds) {
    for await (const sub of stripe.subscriptions.list({ customer, status: 'all', limit: 100 })) {
      const owner = sub.metadata?.userId
      const knownPrice = sub.items?.data?.some(item => priceIds.includes(typeof item.price === 'string' ? item.price : item.price?.id))
      if (owner === userId || sub.id === linked?.id || (!owner && knownPrice)) subscriptions.set(sub.id, sub)
    }
  }
  const live = [...subscriptions.values()].filter(s => !['canceled', 'incomplete_expired'].includes(s.status))
  const existing = live.find(s => ['active', 'trialing'].includes(s.status)) || live[0]
  return { existing, customerId: profile.stripe_customer_id || [...customerIds][0] || null }
}

export async function createSafeCheckout({ stripe, profile, userId, email, planTier, priceId, appUrl, priceIds = [priceId] }) {
  const billing = await findExistingBilling(stripe, profile, userId, email, priceIds)
  if (billing.existing) {
    const error = new Error('This account already has a subscription. Refresh your account or use Manage subscription to resolve billing; do not subscribe again.')
    error.code = 'EXISTING_SUBSCRIPTION'
    error.subscription = billing.existing
    throw error
  }
  const customerId = billing.customerId || (await stripe.customers.create({
    ...(email ? { email } : {}), metadata: { userId },
  }, { idempotencyKey: `trackora-customer-${userId}` })).id
  let previousSessionId = 'initial'
  for await (const session of stripe.checkout.sessions.list({ customer: customerId, limit: 100 })) {
    if (session.mode !== 'subscription' || (session.metadata?.userId !== userId && session.client_reference_id !== userId)) continue
    if (previousSessionId === 'initial') previousSessionId = session.id
    if (session.status === 'complete' && session.subscription) {
      const id = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
      const sub = await stripe.subscriptions.retrieve(id)
      if (!['canceled', 'incomplete_expired'].includes(sub.status)) {
        const error = new Error('Your checkout has already completed. Refresh your account instead of paying again.')
        error.code = 'EXISTING_SUBSCRIPTION'
        error.subscription = sub
        throw error
      }
    }
    if (session.status !== 'open') continue
    if (session.metadata?.planTier !== planTier) {
      const error = new Error('A checkout for another plan is already open. Finish or cancel it before starting a different plan.')
      error.code = 'CHECKOUT_ALREADY_OPEN'
      throw error
    }
    if (session.url) return session
  }
  // Concurrent requests, tabs and retries must resolve to a single Stripe session.
  // Advance only after the previous session closes; no clock-boundary race.
  return stripe.checkout.sessions.create({
    customer: customerId, mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: appUrl, client_reference_id: userId,
    metadata: { userId, planTier },
    subscription_data: { metadata: { userId, planTier } },
  }, { idempotencyKey: `trackora-checkout-${userId}-${previousSessionId}` })
}
