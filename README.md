# AI Guitar Pro Builder

Next.js + MUI app that guides users through a conversation to generate a structured song model and export a Guitar Pro 5 (`.gp5`) file. GP5 writing is handled by a separate Python service using PyGuitarPro.

## Local setup

```bash
npm install
pip install -r services/gp5-writer/requirements.txt
uvicorn services.gp5-writer.main:app --port 8000
npm run dev
```

## Environment variables

- `GP5_WRITER_URL`: URL for the GP5 writer service (e.g. `https://gp5-writer.example.com`).
- `OPENAI_API_KEY`: OpenAI API key used by `/api/chat` to generate song updates.

## Vercel deployment

1. Deploy the Python GP5 writer service (FastAPI) separately (e.g. Render, Fly, ECS).
2. Set `GP5_WRITER_URL` in Vercel project settings.
3. Deploy the Next.js app to Vercel.

## Render deployment (GP5 writer)

This repo includes `render.yaml` to deploy the GP5 writer service.

1. Create a new Render Blueprint and point it at this repo.
2. Render will build the `gp5-writer` service from `services/gp5-writer`.
3. Copy the Render service URL and set it as `GP5_WRITER_URL` in Vercel.

## Tests

```bash
npm run test:compat
```
# aiguitar
