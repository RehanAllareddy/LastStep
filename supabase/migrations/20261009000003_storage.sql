-- Private bucket for assignment evidence. Objects live at
-- {user_id}/{assignment_id}/{submission_id}.webp and are written only by the
-- server (service role) after validation and re-encoding. Owners may read
-- their own objects; access is otherwise through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 5242880, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "submissions: owners can read own evidence"
  on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- No insert/update/delete policies: only the service role writes evidence.
