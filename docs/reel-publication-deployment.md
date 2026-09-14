# Reel publication receipts — 14 September 2026

Applied migration: 20260914165625_c054ba91-060e-4721-823a-ce184f035b67.sql. Lovable recorded the exact reviewed SQL under this application timestamp; the initial 20260914170000_reel_publication_receipts.sql copy is removed to prevent duplicate CREATE TABLE on a fresh database. Do not reapply either SQL in production. Registry statements and both files were compared byte-for-byte after trimming surrounding whitespace.

Only a new service-role-only table was added, with RLS enabled and no client policy. Historical calendar_posts and saved_ideas aggregates remained unchanged. Functions social-instagram-publish and social-publish-scheduled were deployed from the merged sources and their _shared helpers.

Uncertain or orphaned publication attempts do not expire automatically. Check Instagram before technical recovery; do not delete a reservation merely to retry. No real social publication was performed for validation.
