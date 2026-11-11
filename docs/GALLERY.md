# Public Gallery

## Publish academy activities

1. Sign in as Admin or Super Admin and open **Gallery** (`/portal?view=gallery`).
2. Choose **Create album**, enter a title, category, optional event date and
   caption. Save the draft to enable photo uploads.
3. Add JPEG, PNG or WebP photos. The picker accepts up to 10 at a time, each
   original under 10 MB and no larger than 20 megapixels. A gallery album can have
   20 active photos; up to 50 albums may be active at once.
4. Describe each image for accessibility, add photo captions and choose the album
   cover. Use the photo arrows to set their order. A smaller album Display order
   places that album earlier on the website.
5. Confirm that the academy may publish the photos, including the necessary
   permissions from identifiable people/guardians. An optional internal reference
   records where the academy holds that permission; it is never included in
   public responses. Save the album details, then use **Preview**.
6. Choose **Publish album**. The full public homepage Gallery shows published
   albums, category filters and a keyboard-accessible photo viewer. Refresh the
   public page to see new content. No Git commit or deployment is needed.

The empty gallery explains that academy moments are coming soon. It does not
present generated training imagery as actual academy photography. No uploaded
student profile photo is reused automatically.

## Edit, hide and recover

- Choose **Unpublish to edit** before changing a published album or its photos.
  This turns it into a private draft. Save, preview and publish it again.
- **Remove photo** hides a photo but retains its file. Restore it under
  **Removed photos** while the album is a draft.
- **Archive album** hides the entire album and retains its details/photos.
  Select **Archived**, then **Restore draft** to edit it again. Restoration never
  publishes it automatically.
- Already-downloaded photos cannot be recalled from visitors' devices. New public
  image requests are denied as soon as the album is unpublished or archived.

## Storage and validation

`gallery_albums` holds event details, order, visibility and internal permission
confirmation. `gallery_photos` holds descriptions, captions, dimensions, cover
selection, ordering, content hashes and private R2 object keys. Gallery objects
use `gallery/<album-id>/<photo-id>`; private student objects remain separate.

The browser redraws and resizes photos to a maximum 1600-pixel long edge, then
uploads JPEG content. The original file is not stored. The server bounds the raw
upload stream at 2 MiB, validates its JPEG structure/dimensions and independently
removes application/comment metadata, including EXIF/GPS and XMP. Unsupported or
oversized uploads fail before storage. Content hashes avoid duplicate photos in
the same album. If a database write fails after file staging, the new staged
object is cleaned up; cleanup failures are logged by photo ID for an operator.

Database checks/triggers enforce visibility prerequisites, draft-only photo/detail
editing, active album/photo limits and at most one active cover per album. Writes
and audit events use atomic D1 batches. Publication also checks that all active
image objects exist. Soft removal/archiving intentionally retains objects; there
is no automatic permanent-purge job.

The implementation follows [canvas image export](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)
and the JPEG segment structure in [ITU-T T.81, Annex B](https://www.w3.org/Graphics/JPEG/itu-t81.pdf).

## API and access

| Endpoint | Access |
| --- | --- |
| `GET /api/gallery/public` | Published, permission-confirmed album/photo metadata only |
| `GET /api/gallery/image?id=…` | Published active image only; visibility checked on every read |
| `GET /api/gallery/albums` | Admin/Super Admin, including drafts and archived content |
| `GET /api/gallery/preview?id=…` | Admin/Super Admin only |
| `POST /api/gallery/save`, `/status` | Admin/Super Admin; validated album metadata/visibility |
| `POST /api/gallery/upload?album_id=…` | Admin/Super Admin; bounded JPEG upload to a draft |
| `POST /api/gallery/photo-save`, `/photo-order`, `/photo-state` | Admin/Super Admin; draft photos only |

The server checks current academy roles and account revocation. Coaches, parents
and students have no gallery-management access. Origin checks apply to writes.
Public responses omit object keys, content hashes, staff identities and permission
references. The private bucket is never made public. Image responses use
`Cache-Control: no-store` and fixed image content types.

Backups include gallery tables and file references. R2 objects need their own
backup. Restore only into an empty database with matching migrations using the
existing backup conversion script, restore its R2 objects and verify publication
before opening that restored environment to visitors.
