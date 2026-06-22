const { createTestDb } = require('./helpers');
const createAddressRepo = require('../../src/db/addresses');
const createUserRepo = require('../../src/db/users');
const createPostRepo = require('../../src/db/posts');
const createAttachmentRepo = require('../../src/db/attachments');

let db, cleanup, repo, postId;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb('attachments'));
  repo = createAttachmentRepo(db);
  const addressRepo = createAddressRepo(db);
  const userRepo = createUserRepo(db);
  const postRepo = createPostRepo(db);

  const addr = await addressRepo.create({
    street: 'A',
    house_number: '1',
    postal_code: '8000',
    city: 'Zürich',
    display_name: 'A',
  });
  const user = await userRepo.create({
    username: 'attuser',
    password_hash: 'fake',
    address_id: addr.id,
    role: 'resident',
  });
  const post = await postRepo.create({ body: 'test', author_user_id: user.id });
  postId = post.id;
});

afterAll(() => cleanup());
afterEach(() => db('attachments').delete());

const ATT = {
  filename: 'photo.jpg',
  stored_path: '/data/uploads/photo.jpg',
  mime_type: 'image/jpeg',
  size_bytes: 1024 * 1024, // 1 MB
  is_image: true,
};

describe('attachments repo', () => {
  it('creates attachment', async () => {
    const att = await repo.create({ ...ATT, post_id: postId });
    expect(att.id).toBeDefined();
    expect(att.filename).toBe('photo.jpg');
    expect(att.is_image).toBe(1);
  });

  it('findByPostId returns only attachments for given post', async () => {
    await repo.create({ ...ATT, post_id: postId });
    await repo.create({
      ...ATT,
      filename: 'doc.pdf',
      mime_type: 'application/pdf',
      is_image: false,
      post_id: postId,
    });

    const atts = await repo.findByPostId(postId);
    expect(atts).toHaveLength(2);
  });

  it('findImages returns only image attachments', async () => {
    await repo.create({ ...ATT, post_id: postId });
    await repo.create({
      ...ATT,
      filename: 'doc.pdf',
      mime_type: 'application/pdf',
      is_image: false,
      post_id: postId,
    });

    const images = await repo.findImages(postId);
    expect(images).toHaveLength(1);
    expect(images[0].filename).toBe('photo.jpg');
  });

  it('getTotalSize sums size_bytes across all attachments', async () => {
    await repo.create({ ...ATT, size_bytes: 1_000_000, post_id: postId });
    await repo.create({ ...ATT, size_bytes: 2_000_000, post_id: postId });

    const total = await repo.getTotalSize();
    expect(total).toBe(3_000_000);
  });

  it('getTotalSize returns 0 with no attachments', async () => {
    expect(await repo.getTotalSize()).toBe(0);
  });

  it('getStorageStats returns count and total_bytes', async () => {
    await repo.create({ ...ATT, size_bytes: 500_000, post_id: postId });
    await repo.create({ ...ATT, size_bytes: 500_000, post_id: postId });

    const stats = await repo.getStorageStats();
    expect(stats.count).toBe(2);
    expect(stats.total_bytes).toBe(1_000_000);
  });

  it('delete removes single attachment', async () => {
    const att = await repo.create({ ...ATT, post_id: postId });
    await repo.delete(att.id);
    expect(await repo.findById(att.id)).toBeUndefined();
  });

  it('deleteByPostId removes all attachments for post', async () => {
    await repo.create({ ...ATT, post_id: postId });
    await repo.create({ ...ATT, post_id: postId });
    await repo.deleteByPostId(postId);
    expect(await repo.findByPostId(postId)).toHaveLength(0);
  });
});
