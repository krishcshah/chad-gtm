# F08a + F09a API/persistence

## Summary
- Nullable `campaigns.lead_list_id` / `template_id` + `wizard_step`
- `campaignDraftSchema` / `campaignPublishSchema`
- `saveCampaignDraft`, `publishCampaign`, `getCampaignWizardState`; `createCampaign` → `publishCampaign`
- `importLeads` success data includes `listId`

## Commands (green)
```
$ npm run typecheck --workspace=@smartreach/validation --workspace=@smartreach/database --workspace=@smartreach/email-engine --workspace=@smartreach/web
→ exit 0 (validation, database, email-engine, web)

$ npm run test --workspace=@smartreach/validation --workspace=@smartreach/database --workspace=@smartreach/email-engine --workspace=@smartreach/web
→ validation 10 passed; database 15; email-engine 13; web 23 (incl. campaign-drafts 10)
```

## Commit / push
- Branch: `feat/f08a-f09a-drafts` (1 commit ahead of `origin/main` @ `3251131`)
- Tip SHA: run `git rev-parse feat/f08a-f09a-drafts` in wt-forge
- Push to main **blocked**: no GitHub write credentials on box (`could not read Username for https://github.com`). Parent must `git push origin feat/f08a-f09a-drafts:main`.
