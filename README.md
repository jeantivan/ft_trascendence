*This project has been created as part of the 42 curriculum by jeanpaul, <login2>.*

# Omnisport Hub

## Description
Omnisport Hub is a B2B Sports Management SaaS built to centralize administrative, tactical, physical, and medical management for sports teams. It eliminates information fragmentation by providing a secure, real-time, and role-based environment.

Key Features:
- **Unified Calendar**: Manage all team events (matches, training, medical) seamlessly.
- **Advanced Permissions**: Distinct roles for Managers (full access), Staff (segmented writing), and Athletes (read-only).
- **Real-time Communication**: Staff chat using Server-Sent Events (SSE).
- **Analytics Dashboard**: Multi-sport performance tracking via dynamic JSONB data models.
- **File Management**: Tactical and medical document uploads via S3-compatible storage.

## Instructions
### Prerequisites
- Docker & Docker Compose
- Make

### Setup

## Resources
- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma ORM](https://www.prisma.io/)
- [MinIO](https://min.io/)
- [Server-Sent Events (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

*AI Usage: AI tools were used during the initial system design phase to help architecture planning (e.g., structuring the Docker topology, deciding on SSE vs WebSockets) and domain modeling.*

## Team Information - To be filled
- **<login1>**: Product Owner
- **<login2>**: Project Manager
- **<login3>**: Project Manager
- **<login4>**: Technical Lead
- **<loginX>**: Developer

## Technical Stack
- **Frontend/Backend Framework**: Next.js (App Router)
- **Database**: PostgreSQL (using JSONB for flexible metrics)
- **Storage**: MinIO (AWS S3 Compatible)
- **Proxy/Security**: NGINX with OpenSSL self-signed certificates
- **Authentication**: NextAuth.js (Auth.js)

### Justification for Major Choices
- **Next.js Full-Stack**: Selected to unify the codebase, reducing context switching and deployment complexity while fulfilling both frontend and backend requirements.
- **MinIO**: Used to mimic enterprise cloud architecture locally, providing a robust solution for the file upload module without relying on local volumes.
- **SSE + Postgres LISTEN/NOTIFY**: Chosen for real-time features to maintain a strictly HTTP-based stack, avoiding the overhead of maintaining a separate WebSocket server.

## Modules - Needs review.
- **Web (Major - 2pts)**: Next.js used for both frontend and backend.
- **User interaction (Major - 2pts)**: Real-time chat via SSE and contact network.
- **Advanced permissions system (Major - 2pts)**: Role-based access control (Manager, Staff, Athlete).
- **Organization system (Major - 2pts)**: Creation and management of sports clubs.
- **Analytics dashboard (Major - 2pts)**: Dynamic metric visualization.
- **User Management (Major - 2pts)**: Standard user auth and profiles.
- **File upload (Minor - 1pt)**: MinIO integration.
- **ORM (Minor - 1pt)**: Prisma.
**Total Target**: 14 points
