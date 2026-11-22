# Reflection: building Takatax

_A draft for the owner to edit into their own words before submission._

**What I built.** Takatax reads a Filipino small business's receipts, sales invoices, Forms 2307
and COR with AI and turns them into the figures for its BIR returns. I chose the problem because
I see it first-hand: sole proprietors spend days a quarter encoding receipts, and the tools that
exist still make them type every transaction. The validation work (seven steps, with sources)
convinced me the gap is real: 1.13 million micro enterprises, about 171 hours a year of tax
compliance, and competitors that charge a subscription for software that still needs the
encoding.

**The decision that mattered most: AI reads, code computes.** Early on I was tempted to let the
model work out the taxes. Writing the spec changed my mind. A model can read a crumpled receipt
better than any OCR, but a tax figure has to be reproducible and explainable, so the math lives
in a plain, unit-tested TypeScript engine and the model only extracts fields with a confidence
score. The spec review proved the point: the first draft had five tax rules wrong (meals under
OSD, the 2551Q for 8% filers, quarterly instead of cumulative 1701Q, the official receipt instead
of the invoice, and the tax option taken from the COR). Each one is now a rule with a test.

**What worked.** A cheapest-first reader (a fast model, arithmetic checks, a second model from
another company, a top model only when they disagree) keeps the AI cost to a few centavos a page
while flagging what it is unsure of instead of guessing. Working in small pull requests from a
build branch, with CI on every change and Netlify deploying only `main`, meant the live site never
broke while features landed. Row-level security in the database, with SQL behaviour tests, let me
add bookkeeper access, chat and an activity log without worrying about one user seeing another's
data.

**What was hard.** Long PDFs: an edge function has a time limit, so reading moved to a
background job that reads a few pages at a time and saves its progress. When the background-job
host blocked deployments for my account, the same reading plan was moved into a self-restarting
Supabase function behind a one-secret switch, so the product kept working. Costs were the other
lesson: a double click could have paid for the same reading twice, so documents are now claimed in
one database update and read once, with a daily AI spending cap on top.

**Working with an AI coding assistant.** It was fastest when I gave it clear rules (an
`AGENTS.md` with the workflow, authorship and testing rules) and asked it to check its own work:
type-check, tests, lint, build, and a browser check at phone and desktop sizes before every
commit. It was weakest when my request was vague; the fix was to describe the user's moment ("a
bookkeeper opens a client's receipts") rather than the code.

**What I would do differently.** Talk to bookkeepers earlier. Several features (invitations,
the activity log, tags) came from realising late that professionals are both partners and a
sales channel. I would also start the real-receipt validation test before building the third
screen, not after.

**Next.** VAT returns for businesses that pass ₱3M in sales (issue #44), then switching payments
on with Xendit once the free launch has shown that people come back for a second run.
