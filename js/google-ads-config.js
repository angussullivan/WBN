/**
 * Google Ads conversion tracking configuration.
 *
 * Once you've created your Google Ads account:
 * 1. Get your Conversion ID from Tools & Settings -> Conversions
 *    (format "AW-XXXXXXXXX") and set GOOGLE_ADS_ID below.
 * 2. Create a conversion action for each row below and paste in its
 *    label. Leave any value as null to skip tracking that one —
 *    nothing breaks either way, it just won't be measured yet.
 */
var GOOGLE_ADS_ID = null; // e.g. "AW-123456789"

var GOOGLE_ADS_CONVERSIONS = {
  contactFormSubmit: null,  // Conversion action: "Contact form submission"
  bookCallClick: null,      // Conversion action: "Book a call click" — measures click intent, not a confirmed booking
  ebookPurchase: null       // Conversion action: "E-book/program purchase"
};
