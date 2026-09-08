import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.testBatch.deleteMany();
    await prisma.user.deleteMany();
  });

  afterEach(async () => {
    await app.close();
  });

  it('signs up a new user and returns a token (POST /auth/signup)', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'password123' })
      .expect(201);

    expect(response.body).toMatchObject({
      token: expect.any(String),
      user: { name: 'Ada Lovelace', email: 'ada@example.com' },
    });
    expect(response.body.user.passwordHash).toBeUndefined();

    const user = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
    expect(user).not.toBeNull();
    expect(user?.passwordHash).not.toBe('password123');
  });

  it('rejects a signup with an email that is already registered (409)', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'password123' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ name: 'Someone Else', email: 'ada@example.com', password: 'anotherpassword' })
      .expect(409);
  });

  it('rejects a signup with a password shorter than 8 characters (400)', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'short' })
      .expect(400);
  });

  it('logs in an existing user and returns a token (POST /auth/login)', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'password123' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ada@example.com', password: 'password123' })
      .expect(201);

    expect(response.body).toMatchObject({
      token: expect.any(String),
      user: { name: 'Ada Lovelace', email: 'ada@example.com' },
    });
  });

  it('rejects a login with the wrong password (401)', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'password123' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ada@example.com', password: 'wrongpassword' })
      .expect(401);
  });

  it('rejects a login for an email that was never registered (401)', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' })
      .expect(401);
  });

  it('rejects a protected route with no Authorization header (401)', async () => {
    await request(app.getHttpServer()).get('/batches').expect(401);
  });

  it('rejects a protected route with a malformed token (401)', async () => {
    await request(app.getHttpServer())
      .get('/batches')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('allows a protected route with the token from signup (200)', async () => {
    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'password123' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/batches')
      .set('Authorization', `Bearer ${signup.body.token}`)
      .expect(200);
  });
});
