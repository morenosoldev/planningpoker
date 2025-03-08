# Planning Poker App

Et realtids planning poker spil til Jira story estimation.

## Funktioner
- Brugeroprettelse og login
- Tilpassede bruger-avatarer
- Opret og deltag i spilrum via invitationslinks
- Realtids afstemning
- Gemmer afstemningshistorik
- Integration med Jira stories

## Teknisk Stack
- Frontend: React + Vite + TypeScript + Tailwind CSS
- Backend: Rust (Actix-web)
- Database: MongoDB
- Realtids kommunikation: WebSocket

## Opsætning

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
cd backend
cargo run
```

### Miljøvariabler
Opret en `.env` fil i backend mappen med følgende:
```
MONGODB_URI=mongodb://localhost:27017
JWT_SECRET=din_hemmelige_nøgle
``` 