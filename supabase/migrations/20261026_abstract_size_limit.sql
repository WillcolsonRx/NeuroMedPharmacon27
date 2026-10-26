-- Optional storage-level enforcement; the application also enforces 1 MB.
-- Existing uploaded documents are retained.
update storage.buckets
set file_size_limit = 1048576
where id = 'abstract-documents';
