// Reference only (Oct 26, 2026): SMAC's stripeWebhook after the login-email overwrite fix and
// the set-password welcome email. Tests: webhook.test.cjs (FN_FILE=<your index.js>).

function buildWelcomeEmailHtml({ firstName, email, setPasswordLink, tier }) {
  const isPro = tier === "smac_pro";
  const accent = "#5B84A3";
  const reqLines = isPro
    ? `<p style="margin:0 0 2px 0;">• Minimum 3 Instagram posts per week in October</p>
<p style="margin:0 0 2px 0;">• Ramps to 4/week in November, 5/week in December</p>`
    : `<p style="margin:0 0 2px 0;">• Minimum 1 Instagram post per week in October</p>
<p style="margin:0 0 2px 0;">• Ramps to 2/week in November, 3/week in December</p>`;
  const proBlurb = isPro
    ? `<p style="margin:0 0 2px 0;">★ <strong>SMAC Pro Tools:</strong> your Weekly Action Plan generator, Caption Assist, Hook Generator, and Content Performance Analysis are unlocked under the Pro tab — built to save you time planning and writing.</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; font-size: 16px; color: #1a1a2e; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.5;">
<p style="margin:0 0 16px 0;">Hi ${firstName},</p>
<p style="margin:0 0 8px 0;"><strong>Welcome to SMAC! 🎉</strong></p>
<p style="margin:0 0 16px 0;">You just made a real commitment to your business — and now you've got a crew of fellow solopreneurs holding you accountable every step of the way.</p>
<p style="margin:0 0 16px 0;">To get started, log into the SMAC platform below.</p>
<p style="margin:0 0 10px 0;"><strong>Here's what's waiting for you inside:</strong></p>
<p style="margin:0 0 6px 0;">📸 <strong>Feed:</strong> post your content, cheer on your crew, give props, talk strategy, share resources</p>
<p style="margin:0 0 6px 0;">📊 <strong>Tracker:</strong> log your weekly posts and watch your progress build</p>
<p style="margin:0 0 6px 0;">📖 <strong>Resources:</strong> learn different strategies or find inspiration with cited sources</p>
<p style="margin:0 0 6px 0;">➕ <strong>Submit:</strong> a self-reporting system that rewards proof &amp; engagement to win big</p>
<p style="margin:0 0 6px 0;">🏆 <strong>Ranks:</strong> see where you stack up on the leaderboard</p>
<p style="margin:0 0 16px 0;">⭐ <strong>All-Star Status:</strong> meet the posting requirement every week and earn your way to perfection</p>
${proBlurb}
<p style="margin:0 0 6px 0;"><strong>Log in here:</strong> <a href="https://app.joinsmac.com">SMAC Platform</a></p>
<p style="margin:0 0 6px 0;"><strong>Your login email:</strong> ${email}</p>
<p style="margin:0 0 6px 0;"><strong>Step 1:</strong> <a href="${setPasswordLink}">Set your password</a></p>
<p style="margin:0 0 16px 0;"><em>This link expires in 1 hour. If it has expired, go to <a href="https://app.joinsmac.com">app.joinsmac.com</a> and tap "Forgot password?" with the email above.</em></p>
<hr style="border: 1px solid ${accent}; margin: 24px 0;">
<p style="margin:0 0 20px 0;">📋 <strong>SMAC Quick Start Guide</strong></p>
<p style="margin:0 0 8px 0;">🏋️ <strong>The Challenge</strong></p>
<p style="margin:0 0 20px 0;">Post consistently on your Instagram Feed. That's it. Show up, post, and let the community keep you honest.</p>
<p style="margin:0 0 10px 0;">📋 <strong>Posting Requirements — Round 4 (Oct 1 – Dec 31)</strong></p>
${reqLines}
<p style="margin:0 0 6px 0;">• Posts must be original content on your Instagram account</p>
<p style="margin:0 0 6px 0;">• Only IG Feed posts count: single image, carousel, Reel, video, live, or collaboration — it just has to show up on your Feed</p>
<p style="margin:0 0 20px 0;">• No stories or reshares will count</p>
<p style="margin:0 0 10px 0;">💯 <strong>How Points Work</strong></p>
<p style="margin:0 0 20px 0;">Submit your posts and engagement screenshots on the platform to earn points and compete on the leaderboard. Make sure the date &amp; time is visible in the screenshot.</p>
<p style="margin:0 0 10px 0;">📢 <strong>A few things to know:</strong></p>
<p style="margin:0 0 6px 0;">• You do not earn points without submitting proof on the platform</p>
<p style="margin:0 0 6px 0;">• You can still track your own progress toward All-Star Status without submitting — you just won't earn points or appear on the leaderboard</p>
<p style="margin:0 0 20px 0;">• Mutual engagement on other members' posts earns bonus points but is limited weekly — make sure the date &amp; time is in the screenshot</p>
<p style="margin:0 0 8px 0;">⭐ <strong>All-Star Status</strong></p>
<p style="margin:0 0 20px 0;">Hit your posting targets every month (October, November, December) and earn All-Star Status at the end of the round. It's earned, not given. Keep track of your own progress right on the platform.</p>
<p style="margin:0 0 6px 0;">👤 <strong>The IG Accountability Group</strong></p>
<p style="margin:0 0 10px 0;">You'll get the most out of SMAC by staying active in the IG group chats too. Stay up to date, talk strategy, and connect in our Main Group Chat. Share your posts in the Post Sharing Group Chat &amp; allow others to earn engagement points on your posts!</p>
<p style="margin:0 0 6px 0;">1️⃣ <a href="https://ig.me/j/Aba7yMsv29eKefWq/">Join the Main Group Chat</a></p>
<p style="margin:0 0 20px 0;">2️⃣ <a href="https://ig.me/j/AbaKFC0lSTQxnbiJ/">Join the Post Sharing Group Chat</a></p>
<p style="margin:0 0 6px 0;">🚨 <strong>Missing Posts — Here's What Happens</strong></p>
<p style="margin:0 0 6px 0;">• Miss one week → no penalty, life happens</p>
<p style="margin:0 0 20px 0;">• Miss two weeks in a row → you'll be removed from the IG chat and lose the ability to share posts directly for engagement; that's accountability in action</p>
<p style="margin:0 0 16px 0;">But here's the thing: <strong>you keep full access to the platform for the duration of the current Round regardless.</strong></p>
<p style="margin:0 0 16px 0;">And if you're ready to recommit, just reply to this email or send me a message and I'll invite you right back in — no questions asked. We want you to finish, not quit.</p>
<p style="margin:0 0 16px 0;">Questions? Just reply to this email.</p>
<p style="margin:0 0 10px 0;">Looking for more accountability? Learn about <a href="https://joinwac.com" style="color:${accent}; text-decoration:none;">WAC — Website Accountability Challenge</a></p>
<p style="margin:0;">Let's go! 🚀<br>— Nate</p>
</body>
</html>`;
}


exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_WEBHOOK_SECRET, GMAIL_APP_PASSWORD, MAILERLITE_API_KEY] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY || "");
    const sig = req.headers["stripe-signature"];
    const webhookSecret = STRIPE_WEBHOOK_SECRET.value();

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
      console.error("Stripe signature verification failed:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    if (event.type !== "checkout.session.completed") {
      res.status(200).send("Event type ignored.");
      return;
    }

    const session = event.data.object;
    const customerEmail = (
      session.customer_details?.email || session.customer_email || ""
    ).toLowerCase();

    if (!customerEmail) {
      console.error("No customer email in Stripe session:", session.id);
      res.status(200).send("No email found — skipping.");
      return;
    }

    // Detect product type and round from session metadata.
    // Metadata is set on each Stripe Payment Link:
    //   smac_base | smac_pro | smac_sms     and   round: r3 | r4 | ...
    const productMeta = (session.metadata?.product || "").toLowerCase();
    const roundMeta   = (session.metadata?.round   || "").toUpperCase(); // "r3" → "R3"

    console.log(
      `Stripe checkout — product="${productMeta || "(none)"}" round="${roundMeta || "(none)"}" email=${customerEmail}`
    );

    // Account email defaults to the payment email, but a buyer can specify
    // a different login email via the "Login email" custom field on the
    // Payment Link.
    const loginEmailRaw = getCustomFieldValue(session, "login email").toLowerCase().trim();
    const accountEmail  = loginEmailRaw || customerEmail;

    try {
      // Security: find an existing member by payment email OR the typed login
      // email, so a purchase is treated as a renewal for that member instead of
      // creating (and overwriting) their record.
      let snapshot = await db
        .collection("smac_registry")
        .where("email", "==", customerEmail)
        .limit(1)
        .get();
      if (snapshot.empty && accountEmail !== customerEmail) {
        snapshot = await db.collection("smac_registry").where("email", "==", accountEmail).limit(1).get();
      }

      if (snapshot.empty) {
        // ── NEW MEMBER: no existing registry doc — create Auth account + registry doc ──
        console.log(`No registry doc for ${customerEmail} — treating as new signup.`);

        // Resolve tier: prefer metadata (matches existing branches below),
        // fall back to the Stripe Price ID on the session's line item.
        let tier = (productMeta === "smac_base" || productMeta === "smac_pro") ? productMeta : "";
        if (!tier) {
          try {
            const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
            const priceId = lineItems?.data?.[0]?.price?.id || "";
            tier = PRICE_TIER_MAP[priceId] || "";
          } catch (err) {
            console.error(`Line item lookup failed for session ${session.id}:`, err.message);
          }
        }

        if (tier !== "smac_base" && tier !== "smac_pro") {
          console.warn(`⚠️ Could not resolve tier for new signup ${customerEmail} (product="${productMeta}"). No account created.`);
          res.status(200).send("New signup — tier unresolved, no account created.");
          return;
        }

        const newRound     = roundMeta || "R4";
        const customerName = session.customer_details?.name || "";
        const ig           = getCustomFieldValue(session, "instagram") || getCustomFieldValue(session, "ig") || session.metadata?.ig || "";
        const business     = getCustomFieldValue(session, "business") || session.metadata?.business || "";
        // Security: no password is emailed. The login gets a long random
        // password nobody knows; the member sets their own via the link below.
        const password     = require("crypto").randomBytes(24).toString("base64url");

        if (loginEmailRaw && loginEmailRaw !== customerEmail) {
          console.log(`Login email differs from payment email for this signup: paid with ${customerEmail}, account will use ${accountEmail}.`);
        }

        let userRecord;
        let loginAlreadyExisted = false;
        try {
          userRecord = await admin.auth().createUser({
            email: accountEmail,
            password,
            displayName: customerName,
          });
        } catch (err) {
          if (err.code === "auth/email-already-exists") {
            // Auth account exists but wasn't in the registry by email — reuse it,
            // but never overwrite a registry doc that already belongs to it (below).
            userRecord = await admin.auth().getUserByEmail(accountEmail);
            loginAlreadyExisted = true;
          } else {
            console.error(`Auth account creation failed for ${accountEmail}:`, err.message);
            res.status(500).send("Account creation failed.");
            return;
          }
        }

        const newDoc = {
          name: customerName,
          email: accountEmail,
          uid: userRecord.uid,
          ig,
          business,
          rounds: [newRound],
          points: 0,
          totalPosts: 0,
          isFounder: false,
          isVIP: false,
          isAllStar: false,
          isPro: tier === "smac_pro",
          addedAt: admin.firestore.FieldValue.serverTimestamp(),
          stripeSessionId: session.id,
        };
        // Keep the payment email on file if it differs, for support/refund lookups.
        if (loginEmailRaw && loginEmailRaw !== customerEmail) newDoc.paymentEmail = customerEmail;

        // Security: never overwrite an existing member. If this login already has a
        // registry doc (keyed by UID, or a legacy doc carrying this uid), stop and
        // flag it for manual review instead of resetting their points/rounds.
        if (loginAlreadyExisted) {
          const byUidField = await db.collection("smac_registry").where("uid", "==", userRecord.uid).limit(1).get();
          if (!byUidField.empty) {
            console.warn(`⚠️ MANUAL REVIEW: paid by ${customerEmail} for existing login ${accountEmail} (uid=${userRecord.uid}, registry doc ${byUidField.docs[0].id}). Nothing changed. Session ${session.id}.`);
            res.status(200).send("Existing member — not overwritten; flagged for manual review.");
            return;
          }
        }
        try {
          await db.collection("smac_registry").doc(userRecord.uid).create(newDoc); // create() fails if the doc exists
        } catch (err) {
          if (err.code === 6 || /already exists/i.test(err.message || "")) {
            console.warn(`⚠️ MANUAL REVIEW: registry doc ${userRecord.uid} already exists for ${accountEmail}. Nothing changed. Session ${session.id}.`);
            res.status(200).send("Existing member — not overwritten; flagged for manual review.");
            return;
          }
          throw err;
        }
        console.log(`✅ New ${tier} member created: ${accountEmail} (round=${newRound})`);

        // Welcome email — best-effort, doesn't fail the webhook if it errors.
        try {
          const transporter = getGmailTransporter();
          const firstName = (customerName || "there").split(" ")[0];
          const setPasswordLink = await admin.auth().generatePasswordResetLink(accountEmail);
          await transporter.sendMail({
            from: '"Nate Templeton" <info@joinsmac.com>',
            to: accountEmail,
            subject: "🎉 Welcome to SMAC! Your Platform Account is Ready",
            html: buildWelcomeEmailHtml({ firstName, email: accountEmail, setPasswordLink, tier }),
          });
          console.log(`✅ Welcome email sent to ${accountEmail}`);
        } catch (err) {
          console.error(`❌ Welcome email failed for ${accountEmail}:`, err.message);
        }

        // MailerLite — best-effort, doesn't fail the webhook if it errors.
        try {
          await axios.post(
            "https://connect.mailerlite.com/api/subscribers",
            {
              email: accountEmail,
              fields: { name: customerName },
              groups: [MAILERLITE_GROUP_ID],
            },
            {
              headers: {
                Authorization: `Bearer ${MAILERLITE_API_KEY.value()}`,
                "Content-Type": "application/json",
              },
            }
          );
          console.log(`✅ Added ${accountEmail} to MailerLite group ${MAILERLITE_GROUP_ID}`);
        } catch (err) {
          console.error(`❌ MailerLite subscribe failed for ${accountEmail}:`, err.response?.data || err.message);
        }

        res.status(200).send("New member account created.");
        return;
      }

      const docRef = snapshot.docs[0].ref;
      const existingData = snapshot.docs[0].data();

      // Compute deduped rounds array (uppercase) — used by every branch that grants something.
      // Pushes the round onto the existing array only if not already present.
      const existingRounds = Array.isArray(existingData.rounds) ? existingData.rounds : [];
      const mergedRounds = roundMeta && !existingRounds.includes(roundMeta)
        ? [...existingRounds, roundMeta]
        : existingRounds;

      // ── SMS Add-On ────────────────────────────────────────────────────────
      if (productMeta === "smac_sms") {
        if (existingData.hasSMS === true) {
          console.log(`Member ${customerEmail} already has SMS add-on — skipping.`);
          res.status(200).send("Already has SMS add-on.");
          return;
        }
        const update = {
          hasSMS: true,
          smsSince: admin.firestore.FieldValue.serverTimestamp(),
          stripeSessionId: session.id,
        };
        if (roundMeta) {
          update.smsRound = roundMeta;
          update.rounds = mergedRounds;
        }
        await docRef.update(update);
        console.log(`✅ SMS add-on granted to ${customerEmail} (round=${roundMeta || "n/a"}, session: ${session.id})`);
        res.status(200).send("SMS add-on granted.");
        return;
      }

      // ── Pro Upgrade ───────────────────────────────────────────────────────
      if (productMeta === "smac_pro") {
        const memberName = existingData.name || "";
        const firstName = (memberName || "there").split(" ")[0];

        if (existingData.isPro === true) {
          // Already Pro — still record the round on this renewal if it's new.
          if (roundMeta && !existingRounds.includes(roundMeta)) {
            await docRef.update({ rounds: mergedRounds, proRound: roundMeta });
            console.log(`Member ${customerEmail} already Pro — rounds array updated with ${roundMeta}.`);
            try {
              const transporter = getGmailTransporter();
              await transporter.sendMail({
                from: '"Nate Templeton" <info@joinsmac.com>',
                to: customerEmail,
                subject: "🎉 You're In — SMAC Pro, Round 4",
                html: buildRenewalEmailHtml({ firstName, tier: "smac_pro", round: roundMeta }),
              });
              console.log(`✅ Renewal email sent to ${customerEmail}`);
            } catch (err) {
              console.error(`❌ Renewal email failed for ${customerEmail}:`, err.message);
            }
          } else {
            console.log(`Member ${customerEmail} is already Pro — skipping.`);
          }
          res.status(200).send("Already Pro.");
          return;
        }
        const update = {
          isPro: true,
          proSince: admin.firestore.FieldValue.serverTimestamp(),
          proExpiry: null,
          stripeSessionId: session.id,
        };
        if (roundMeta) {
          update.proRound = roundMeta;
          update.rounds = mergedRounds;
        }
        await docRef.update(update);
        console.log(`✅ Pro access granted to ${customerEmail} (round=${roundMeta || "n/a"}, session: ${session.id})`);
        try {
          const transporter = getGmailTransporter();
          await transporter.sendMail({
            from: '"Nate Templeton" <info@joinsmac.com>',
            to: customerEmail,
            subject: "🎉 You're In — SMAC Pro, Round 4",
            html: buildRenewalEmailHtml({ firstName, tier: "smac_pro", round: roundMeta || "R4" }),
          });
          console.log(`✅ Renewal email sent to ${customerEmail}`);
        } catch (err) {
          console.error(`❌ Renewal email failed for ${customerEmail}:`, err.message);
        }
        res.status(200).send("Pro access granted.");
        return;
      }

      // ── Base SMAC Renewal ─────────────────────────────────────────────────
      // No Pro flag is granted. Just record the round on the registry doc.
      if (productMeta === "smac_base") {
        const memberName = existingData.name || "";
        const firstName = (memberName || "there").split(" ")[0];

        if (roundMeta && !existingRounds.includes(roundMeta)) {
          await docRef.update({ rounds: mergedRounds });
          console.log(`✅ Base SMAC renewal recorded for ${customerEmail} — added ${roundMeta} to rounds.`);
          try {
            const transporter = getGmailTransporter();
            await transporter.sendMail({
              from: '"Nate Templeton" <info@joinsmac.com>',
              to: customerEmail,
              subject: "🎉 You're In — SMAC Round 4",
              html: buildRenewalEmailHtml({ firstName, tier: "smac_base", round: roundMeta }),
            });
            console.log(`✅ Renewal email sent to ${customerEmail}`);
          } catch (err) {
            console.error(`❌ Renewal email failed for ${customerEmail}:`, err.message);
          }
        } else {
          console.log(`Base SMAC renewal for ${customerEmail} — round ${roundMeta || "(none)"} already on doc.`);
        }
        res.status(200).send("Base renewal recorded.");
        return;
      }

      // ── Unknown / unlabeled product ───────────────────────────────────────
      // Fail closed: do NOT grant Pro by default. Log so it can be reconciled manually.
      console.warn(
        `⚠️ Unlabeled or unknown product metadata ("${productMeta}") for ${customerEmail}. No flag changes applied.`
      );
      res.status(200).send("Acknowledged — unlabeled product, no changes.");
    } catch (err) {
      console.error("Firestore update failed:", err);
      res.status(500).send("Internal error.");
    }
  }
);

