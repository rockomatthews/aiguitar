# Architecture

## Components

- **Frontend (Next.js + MUI)**: Chat-driven UI to capture user intent, preview
  the current song model, and download the GP5 file.
- **API Routes (Next.js)**:
  - `/api/chat`: Orchestrates the conversation and updates the song model.
  - `/api/export/gp5`: Sends the song model to the GP5 writer service and
    returns the binary file.
- **GP5 Writer Service (Python FastAPI)**: Converts the song schema into a
  `.gp5` file using PyGuitarPro for correct binary serialization.
- **Tests**: Compatibility checks validate that the generated GP5 file can be
  parsed by PyGuitarPro.

## Data Flow

1. User submits a prompt in the UI.
2. `/api/chat` updates the song JSON and returns follow-up questions.
3. User refines details until satisfied.
4. `/api/export/gp5` calls the writer service to generate GP5 bytes.
5. The user downloads the `.gp5` file.
