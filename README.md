# Email Sending

One outbound-email path for every Cinatra agent, no matter which mailbox actually sends the message. Agents hand the connector a finished email; the connector picks the right provider for the sender and routes the send, so behaviour stays consistent as you add or swap mailboxes.

## Works with

- Gmail
- Resend
- Additional email providers installed as extensions

## Capabilities

- Send an email from a Cinatra agent through whichever provider is connected
- Match each send to the right mailbox for the sender
- Find the reply to an email Cinatra has previously sent
- Safely reroute every recipient to a single address while testing
