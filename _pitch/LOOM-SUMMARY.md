# Loom video title

Aide, work you can hear. Voice-native work and pay on Monnify

# Loom video description

The online economy was built for people who can see it. Sign-up forms, dashboards, uploaded
CVs, one-time codes on a screen. Every one of them is a wall if you are blind. The usual answer
is a screen reader bolted onto a sighted-first app, and it is most brittle exactly where it
matters most, which is money.

Aide starts from the other end. The conversation is the product. The screen is an optional
mirror for those who can use it.

In this video a blind worker finds a transcription gig, applies, passes a spoken assessment,
gets hired, and receives real money in her own bank account. She never reads a screen.

Nothing here is mocked. Real sandbox money moving through real bank rails:

- Monnify mints a dedicated reserved account (NUBAN) per worker. Sandbox merchant "byte tech",
  account 1000824409.
- Inbound transfers are verified server-side before Aide announces them. Webhooks are rejected
  unless the SHA-512 HMAC signature matches. Aide is architecturally forbidden from inventing
  a number.
- Withdrawal runs name enquiry on the destination account, reads the bank-verified name and the
  amount back aloud, and goes out only after you confirm out loud. That is the accessible
  equivalent of an OTP, a code you say instead of one you read.
- The assessment is graded server-side against a rubric. The answer key never leaves the server.
- Getting hired opens a private channel. The first task and the login details are read aloud the
  moment they land, so the handoff does not dump you back into an inbox.

Withdrawal returns PENDING_AUTHORIZATION. Third-party payouts sit behind full business
activation and KYC, which is not a same-day unblock. We show the real API response rather than
a fake success screen.

Live: aide-ng.vercel.app

# Spoken opener (say this to the reviewer, ~60 seconds)

Hi, I'm David. This is Aide.

The online economy was built for people who can see it. Forms, dashboards, uploaded CVs, codes
on a screen. Every one of them is a wall if you are blind. The usual answer is a screen reader
bolted onto an app built for sighted people, and it breaks worst exactly where it matters most,
which is money.

Aide starts from the other end. The conversation is the product. The screen is optional.

In the next three minutes you will watch a blind worker find a transcription job, apply, pass a
spoken assessment, get hired, and receive real money in her own bank account. She never reads a
screen.

Nothing here is mocked. Monnify mints her a real dedicated account. The employer pays twelve
thousand naira. Aide checks the webhook signature, re-confirms the payment server-side, and only
then says the number out loud. It cannot invent a balance.

One thing I will show you honestly. The withdrawal comes back pending authorization, because
third-party payouts need full business activation and KYC. I am showing you the real response
instead of a fake success screen.

That is Aide. Work you can hear.
