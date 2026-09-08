import { INestApplication } from '@nestjs/common';
import request from 'supertest';

let counter = 0;

/** Signs up a fresh test user and returns a bearer token for it. */
export async function signupAndAuthenticate(
  app: INestApplication,
): Promise<{ token: string; userId: string }> {
  counter += 1;
  const email = `test-user-${counter}@example.com`;

  const response = await request(app.getHttpServer())
    .post('/auth/signup')
    .send({ name: 'Test User', email, password: 'password123' })
    .expect(201);

  return { token: response.body.token, userId: response.body.user.id };
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
