# Mino

Mino is a mobile app that measures motor control and reaction speed through short, game-like tests.

## What it does

- Runs quick phone tests: finger tapping, reaction time, target tapping, finger tracing, phone stability and guided movement.
- Records the raw touch and motion-sensor data from each test.
- Compares each result with the user's own history and explains it in plain language.

Mino is an experimental wellness project, not a medical device.

## How to run

```bash
npm install
docker compose up -d
cp apps/api/.env.example apps/api/.env
```

Then start each part in its own terminal, from the repo root:

```bash
cd apps/api && npx prisma migrate deploy && npm run start:dev
cd services/ml && uv run flask --app mino_ml.app run --port 5001
cd services/llm-explain && python3 -m mino_llm.dev_stub
cd apps/mobile && npm start
```
