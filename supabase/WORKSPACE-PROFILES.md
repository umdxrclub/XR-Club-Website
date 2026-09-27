# SUITS profiles and ownership

Migration `20260927000000_suits_profiles.sql` is applied to the existing project `cpgkqtldivzjmzxqcsvf`. It adds avatar seed, suit color, and setup timestamp fields to the existing roster. All 18 existing members and their current assignments were preserved.

Only the authenticated Auth account `kcyle@terpmail.umd.edu`, with its existing lead role, can manage access levels and subteams. Other lead labels and club board/admin status do not confer that permission. Table triggers prevent self-promotion, changing account identity, and changing subteams through profile writes. The proposal role selector is only a local reading filter.

`suits_manage_member` updates access and subteam together. `suits_save_avatar` saves the caller’s own validated seed/color and a deterministic DiceBear URL. `suits_join` retains custom avatars across later sign-ins and does not auto-promote new members.

Sidebar, Top tabs, Bottom dock, Right sidebar, Icon rail, and Wide layouts are saved on each device. Sign-in retains the existing Supabase client and session storage. Calendar and Discord delivery functions and cron configuration are unchanged.

Run `npm test` for isolated PGlite permission, persistence, calendar, and navigation checks. The development-only `/suits/preview/` route uses isolated sample data; `?member=1` previews member permissions. It is not included in production builds.
