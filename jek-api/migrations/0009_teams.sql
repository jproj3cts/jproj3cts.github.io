-- Teams: a workspace of kind 'team' that several people share, paid for by
-- its owner with a seat for each owner, admin and editor (viewers take none).
--
-- Invitations go by email with a link that holds a token; one invitation per
-- address per team at a time. Nothing else is new: members, invitations,
-- subscriptions (plan 'team', seats = the Stripe quantity) and audit (the
-- team's activity record) were in the first migration.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_workspace_email ON invitations(workspace_id, email);
