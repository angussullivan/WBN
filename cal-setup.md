# Setting up Cal.com bookings for Jenna

This is a free, no-coding signup on Cal.com's side. The site's booking
buttons are already wired up and waiting for three details from this setup —
they currently fall back to the contact form until then.

## 1. Create the Cal.com account

1. Go to `cal.com` and sign up using `jenna4134@gmail.com`.
2. Choose a username when prompted (e.g. `wellbeyondnow` or `jenna-wbn` —
   whatever's free). This becomes part of the booking link, e.g.
   `cal.com/wellbeyondnow`.
3. Set the timezone to the correct Australian timezone in **Settings →
   General**.
4. Connect the calendar that should be checked for conflicts and receive
   bookings, under **Settings → My Availability** / **Apps → Calendar**
   (Google Calendar is the easiest if `jenna4134@gmail.com` is a Gmail/Google
   Workspace address).
5. Set working hours in **Availability** so people can't book outside
   sensible times.

## 2. Create three Event Types

In **Event Types**, create one for each of the three booking buttons already
on the site:

| Event Type to create | Suggested length | Where it appears on the site |
|---|---|---|
| Free Discovery Call | 20 min | Home, About, Services, Programs, Privacy, Contact — main "Book a Call" buttons |
| 1:1 Coaching Session | 90 min | Services page, Contact page |
| In-home Postpartum Visit | whatever suits (e.g. 60–90 min) | Contact page |

For each one, note the **slug** — the bit of the URL after your username,
e.g. `cal.com/wellbeyondnow/discovery-call` has the slug `discovery-call`.
You can set the slug yourself when creating the event, or use whatever
Cal.com generates from the title.

Add a buffer before/after each event type if back-to-back bookings aren't
wanted (**Event Type → Limits**).

## 3. Send me three things

Once the account and event types exist, send me:

1. Your Cal.com **username**
2. The **slug** for the Discovery Call event
3. The **slug** for the 1:1 Coaching Session event
4. The **slug** for the Postpartum Visit event

I'll drop these into `js/cal-config.js` and push — the "Book a Call" / "Book
Now" buttons across the site will then open a real Cal.com booking widget
instead of falling back to the contact form, with no other changes needed.

## What's already built and waiting

- Every booking button on the site already has the right hooks
  (`data-cal-event="discoveryCall"` etc.) — nothing else needs to change in
  the code.
- Clicks are already tracked as a Google Ads conversion (`bookCallClick`)
  the moment someone clicks a booking button, even before Cal.com itself is
  connected — so no conversion data is lost during this setup.
- The embed is styled to match the site's rose/blush theme
  (`brandColor: '#b9716c'`) and opens as a popup calendar, not a page
  redirect.
