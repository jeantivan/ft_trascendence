// @vitest-environment node
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { userRepository } from "@/lib/auth/user-repository";
import { buildExportFiles } from "@/lib/gdpr/export/build-export-files";
import { createPrismaExportUserRepository } from "@/lib/gdpr/export/prisma-export-user-repository";

const email = "export-user-repository@example.com";
const otherEmail = "export-user-repository-other@example.com";
const orgName = "export-user-repository-org";
const repository = createPrismaExportUserRepository(prisma);

describe("Integration: createPrismaExportUserRepository", () => {
  afterEach(async () => {
    // Conversations first: they have no owner to cascade from once the users are gone
    await prisma.conversation.deleteMany({
      where: { OR: [{ participants: { some: { user: { email: { in: [email, otherEmail] } } } } }, { event: { organization: { name: orgName } } }] },
    });
    await prisma.user.deleteMany({ where: { email: { in: [email, otherEmail] } } });
    await prisma.event.deleteMany({ where: { organization: { name: orgName } } });
    // Restrict: a club with sessions cannot be deleted, so the sessions go first
    await prisma.trainingSession.deleteMany({ where: { organization: { name: orgName } } });
    await prisma.organization.deleteMany({ where: { name: orgName } });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("devuelve el perfil con los métodos de acceso y sin secretos", async () => {
    const user = await prisma.user.create({
      data: {
        email,
        nick: "runner",
        passwordHash: "$2b$10$secret-hash",
        email2faEnabled: true,
        accounts: {
          create: {
            type: "oauth",
            provider: "google",
            providerAccountId: "export-repo-google-1",
            access_token: "oauth-access-token",
          },
        },
      },
    });

    const profile = await repository.findProfile(user.id);

    expect(profile).toEqual({
      id: user.id,
      email,
      nick: "runner",
      image: null,
      createdAt: user.createdAt,
      hasPassword: true,
      providers: ["google"],
      totpEnabled: false,
      email2faEnabled: true,
    });
    expect(JSON.stringify(profile)).not.toContain("secret-hash");
    expect(JSON.stringify(profile)).not.toContain("oauth-access-token");
  });

  it("devuelve null si el usuario no existe", async () => {
    await expect(repository.findProfile("00000000-0000-4000-8000-000000000000")).resolves.toBeNull();
  });

  describe("findAccountData", () => {
    const at = (day: number) => new Date(`2026-11-${String(day).padStart(2, "0")}T08:00:00.000Z`);

    async function createFixture() {
      const user = await prisma.user.create({
        data: {
          email,
          nick: "runner",
          statsPublic: true,
          showOnline: false,
          healthConsentAt: at(1),
          healthConsentVersion: 2,
        },
      });
      const other = await prisma.user.create({ data: { email: otherEmail, nick: "other" } });
      const org = await prisma.organization.create({ data: { name: orgName, timezone: "Europe/Madrid" } });
      return { user, other, org };
    }

    it("devuelve los ajustes y el consentimiento del usuario", async () => {
      const { user } = await createFixture();

      const data = await repository.findAccountData(user.id);

      expect(data).toMatchObject({
        settings: { statsPublic: true, notificationsEnabled: true, showOnline: false },
        consents: { healthConsentAt: at(1), healthConsentVersion: 2 },
      });
    });

    it("devuelve los clubes del usuario con el nombre y su rol", async () => {
      const { user, other, org } = await createFixture();
      await prisma.membership.create({ data: { userId: user.id, orgId: org.id, role: "athlete", joinedAt: at(2) } });
      await prisma.membership.create({ data: { userId: other.id, orgId: org.id, role: "manager" } });

      const data = await repository.findAccountData(user.id);

      expect(data?.memberships).toEqual([{ orgId: org.id, orgName, role: "athlete", joinedAt: at(2) }]);
    });

    it("devuelve solo los grupos del usuario", async () => {
      const { user, other, org } = await createFixture();
      const mine = await prisma.group.create({
        data: { orgId: org.id, name: "mine", level: "intermedio", objective: "maratón" },
      });
      const notMine = await prisma.group.create({ data: { orgId: org.id, name: "not-mine" } });
      await prisma.groupMember.create({ data: { groupId: mine.id, userId: user.id } });
      await prisma.groupMember.create({ data: { groupId: notMine.id, userId: other.id } });

      const data = await repository.findAccountData(user.id);

      expect(data?.groups).toEqual([
        { groupId: mine.id, orgId: org.id, name: "mine", level: "intermedio", objective: "maratón" },
      ]);
    });

    it("devuelve null en los dos consentimientos si no los dio", async () => {
      const user = await prisma.user.create({ data: { email } });

      const data = await repository.findAccountData(user.id);

      expect(data?.consents).toEqual({ healthConsentAt: null, healthConsentVersion: null });
    });

    it("devuelve los Events con plaza pedida en cualquier estado, también cancelados", async () => {
      const { user, other, org } = await createFixture();
      const makeEvent = (title: string, day: number, cancelledAt: Date | null = null) =>
        prisma.event.create({
          data: { orgId: org.id, title, location: "Retiro", startsAt: at(day), cancelledAt },
        });
      const first = await makeEvent("first", 10);
      const second = await makeEvent("second", 11, at(5));
      const notRequested = await makeEvent("not-requested", 12);
      await prisma.spotRequest.create({ data: { eventId: second.id, userId: user.id, status: "withdrawn", createdAt: at(3) } });
      await prisma.spotRequest.create({ data: { eventId: first.id, userId: user.id, status: "approved", createdAt: at(4) } });
      await prisma.spotRequest.create({ data: { eventId: notRequested.id, userId: other.id } });

      const data = await repository.findAccountData(user.id);

      expect(data?.events).toEqual([
        {
          eventId: first.id,
          orgId: org.id,
          title: "first",
          location: "Retiro",
          startsAt: at(10),
          yourStatus: "approved",
          requestedAt: at(4),
        },
        expect.objectContaining({ eventId: second.id, yourStatus: "withdrawn", requestedAt: at(3) }),
      ]);
    });

    it("devuelve el Feedback recibido sin manager, también el de un Event borrado", async () => {
      const { user, other, org } = await createFixture();
      const event = await prisma.event.create({
        data: { orgId: org.id, title: "run", location: "Retiro", startsAt: at(10) },
      });
      const received = await prisma.feedback.create({
        data: { eventId: event.id, athleteId: user.id, managerId: other.id, body: "Buen ritmo", createdAt: at(11) },
      });
      const orphan = await prisma.feedback.create({
        data: { eventId: event.id, athleteId: user.id, managerId: other.id, body: "Sigue así", createdAt: at(12) },
      });
      await prisma.feedback.create({ data: { athleteId: other.id, managerId: user.id, body: "Not hers" } });
      await prisma.event.delete({ where: { id: event.id } });

      const data = await repository.findAccountData(user.id);

      expect(data?.feedbackReceived).toEqual([
        { id: received.id, eventId: null, body: "Buen ritmo", createdAt: at(11) },
        { id: orphan.id, eventId: null, body: "Sigue así", createdAt: at(12) },
      ]);
      expect(JSON.stringify(data)).not.toContain(other.id);
    });

    it("devuelve los contactos como user_a o user_b sin datos del otro usuario", async () => {
      const { user, other } = await createFixture();
      const third = await prisma.user.create({ data: { email: "export-user-repository-third@example.com" } });
      const [a, b] = [user.id, other.id].sort();
      await prisma.contact.create({
        data: { userA: a, userB: b, status: "accepted", requestedBy: user.id, createdAt: at(3) },
      });
      const [c, d] = [user.id, third.id].sort();
      await prisma.contact.create({
        data: { userA: c, userB: d, status: "pending", requestedBy: third.id, createdAt: at(4) },
      });
      await prisma.user.deleteMany({ where: { email: "export-user-repository-third@example.com" } });
      const unrelated = await prisma.user.create({ data: { email: "export-user-repository-fourth@example.com" } });
      const [e, f] = [other.id, unrelated.id].sort();
      await prisma.contact.create({ data: { userA: e, userB: f, requestedBy: other.id } });

      const data = await repository.findAccountData(user.id);

      expect(data?.contacts).toEqual([{ status: "accepted", requestedByYou: true, createdAt: at(3) }]);
      expect(JSON.stringify(data)).not.toContain(other.id);
      expect(JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? String(value) : value))).not.toContain("nick");
      await prisma.user.deleteMany({ where: { email: "export-user-repository-fourth@example.com" } });
    });

    it("devuelve las notificaciones del usuario sin payload y con id bigint", async () => {
      const { user, other } = await createFixture();
      const first = await prisma.notification.create({
        data: { userId: user.id, type: "spot_approved", payload: { eventId: "secret-payload" }, createdAt: at(3) },
      });
      const second = await prisma.notification.create({
        data: { userId: user.id, type: "spot_rejected", payload: {}, readAt: at(5), createdAt: at(4) },
      });
      await prisma.notification.create({ data: { userId: other.id, type: "not_hers", payload: {} } });

      const data = await repository.findAccountData(user.id);

      expect(data?.notifications).toEqual([
        { id: first.id, type: "spot_approved", readAt: null, createdAt: at(3) },
        { id: second.id, type: "spot_rejected", readAt: at(5), createdAt: at(4) },
      ]);
      expect(typeof data?.notifications[0].id).toBe("bigint");
    });

    it("devuelve null si el usuario no existe", async () => {
      await expect(repository.findAccountData("00000000-0000-4000-8000-000000000000")).resolves.toBeNull();
    });
  });

  describe("findSessions", () => {
    const base = { origin: "template", sessionType: "rodaje" } as const;

    async function createFixture() {
      const user = await prisma.user.create({ data: { email, nick: "runner" } });
      const other = await prisma.user.create({ data: { email: otherEmail, nick: "other" } });
      const org = await prisma.organization.create({ data: { name: orgName, timezone: "Europe/Madrid" } });
      const currentGroup = await prisma.group.create({ data: { orgId: org.id, name: "current" } });
      const leftGroup = await prisma.group.create({ data: { orgId: org.id, name: "left" } });
      const foreignGroup = await prisma.group.create({ data: { orgId: org.id, name: "foreign" } });
      await prisma.groupMember.create({ data: { groupId: currentGroup.id, userId: user.id } });
      await prisma.groupMember.create({ data: { groupId: foreignGroup.id, userId: other.id } });
      return { user, other, org, currentGroup, leftGroup, foreignGroup };
    }

    it("devuelve las sesiones individuales, las de sus grupos y las de grupos que dejó si tiene registro", async () => {
      const { user, other, org, currentGroup, leftGroup, foreignGroup } = await createFixture();
      const at = (day: number) => new Date(`2026-11-${day}T08:00:00.000Z`);
      const individual = await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, athleteId: user.id, scheduledAt: at(10), targetDistanceM: 5000 },
      });
      const ofCurrentGroup = await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, groupId: currentGroup.id, scheduledAt: at(11), targetPaceSPerKm: 300 },
      });
      const ofLeftGroup = await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, groupId: leftGroup.id, scheduledAt: at(12), targetDurationS: 1800 },
      });
      await prisma.sessionLog.create({
        data: { sessionId: ofLeftGroup.id, athleteId: user.id, completed: true, performedAt: at(12) },
      });
      // Not hers: a left group without her log, a group she never belonged to, someone else's
      await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, groupId: leftGroup.id, scheduledAt: at(13) },
      });
      await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, groupId: foreignGroup.id, scheduledAt: at(14) },
      });
      await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, athleteId: other.id, scheduledAt: at(15) },
      });

      const sessions = await repository.findSessions(user.id);

      expect(sessions).toEqual([
        {
          id: individual.id,
          orgId: org.id,
          origin: "template",
          sessionType: "rodaje",
          targetDistanceM: 5000,
          targetPaceSPerKm: null,
          targetDurationS: null,
          scheduledAt: at(10),
          groupId: null,
          customizesSessionId: null,
        },
        expect.objectContaining({ id: ofCurrentGroup.id, groupId: currentGroup.id, targetPaceSPerKm: 300 }),
        expect.objectContaining({ id: ofLeftGroup.id, groupId: leftGroup.id, targetDurationS: 1800 }),
      ]);
    });

    it("devuelve la sesión que su copia personalizada modifica", async () => {
      const { user, org, currentGroup } = await createFixture();
      const groupSession = await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, groupId: currentGroup.id, scheduledAt: new Date("2026-11-10T08:00:00.000Z") },
      });
      const copy = await prisma.trainingSession.create({
        data: {
          orgId: org.id,
          origin: "customized",
          sessionType: "rodaje",
          athleteId: user.id,
          customizesSessionId: groupSession.id,
          scheduledAt: new Date("2026-11-10T08:00:00.000Z"),
        },
      });

      const sessions = await repository.findSessions(user.id);

      expect(sessions.map((session) => session.id).sort()).toEqual([groupSession.id, copy.id].sort());
      expect(sessions.find((session) => session.id === copy.id)?.customizesSessionId).toBe(groupSession.id);
    });

    it("devuelve la sesión original de su copia aunque haya dejado el grupo", async () => {
      const { user, org, currentGroup } = await createFixture();
      const groupSession = await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, groupId: currentGroup.id, scheduledAt: new Date("2026-11-10T08:00:00.000Z") },
      });
      const copy = await prisma.trainingSession.create({
        data: {
          orgId: org.id,
          origin: "customized",
          sessionType: "rodaje",
          athleteId: user.id,
          customizesSessionId: groupSession.id,
          scheduledAt: new Date("2026-11-10T08:00:00.000Z"),
        },
      });
      await prisma.groupMember.deleteMany({ where: { groupId: currentGroup.id, userId: user.id } });

      const sessions = await repository.findSessions(user.id);

      expect(sessions.map((session) => session.id).sort()).toEqual([groupSession.id, copy.id].sort());
    });

    it("no devuelve la sesión individual de otro atleta aunque tenga un registro suyo", async () => {
      const { user, other, org } = await createFixture();
      const othersSession = await prisma.trainingSession.create({
        data: { ...base, orgId: org.id, athleteId: other.id, scheduledAt: new Date("2026-11-10T08:00:00.000Z") },
      });
      await prisma.sessionLog.create({
        data: { sessionId: othersSession.id, athleteId: user.id, completed: true, performedAt: new Date("2026-11-10T09:00:00.000Z") },
      });

      await expect(repository.findSessions(user.id)).resolves.toEqual([]);
    });

    it("devuelve una lista vacía si no tiene sesiones", async () => {
      const { user } = await createFixture();

      await expect(repository.findSessions(user.id)).resolves.toEqual([]);
    });
  });

  describe("findSessionLogs", () => {
    const at = (day: number) => new Date(`2026-11-${String(day).padStart(2, "0")}T08:00:00.000Z`);

    async function createFixture() {
      const user = await prisma.user.create({ data: { email, nick: "runner" } });
      const other = await prisma.user.create({ data: { email: otherEmail, nick: "other" } });
      const org = await prisma.organization.create({ data: { name: orgName, timezone: "Europe/Madrid" } });
      const group = await prisma.group.create({ data: { orgId: org.id, name: "group" } });
      const groupSession = await prisma.trainingSession.create({
        data: { orgId: org.id, groupId: group.id, origin: "template", sessionType: "rodaje", scheduledAt: at(9) },
      });
      const individual = await prisma.trainingSession.create({
        data: { orgId: org.id, athleteId: user.id, origin: "template", sessionType: "rodaje", scheduledAt: at(10) },
      });
      return { user, other, groupSession, individual };
    }

    it("devuelve solo sus registros, por fecha, con extra tal cual y sin los de otro atleta en la misma sesión", async () => {
      const { user, other, groupSession, individual } = await createFixture();
      const later = await prisma.sessionLog.create({
        data: { sessionId: individual.id, athleteId: user.id, completed: false, rpe: 5, durationS: 600, performedAt: at(12), extra: { incompletion_reason: "time_constraints" } },
      });
      const earlier = await prisma.sessionLog.create({
        data: { sessionId: groupSession.id, athleteId: user.id, completed: true, rpe: 7, distanceM: 10200, durationS: 3600, performedAt: at(11), extra: { avg_heart_rate_bpm: 148, max_heart_rate_bpm: 175 } },
      });
      await prisma.sessionLog.create({
        data: { sessionId: groupSession.id, athleteId: other.id, completed: true, rpe: 9, performedAt: at(11) },
      });

      await expect(repository.findSessionLogs(user.id)).resolves.toEqual([
        { sessionId: earlier.sessionId, completed: true, rpe: 7, distanceM: 10200, durationS: 3600, performedAt: at(11), extra: { avg_heart_rate_bpm: 148, max_heart_rate_bpm: 175 } },
        { sessionId: later.sessionId, completed: false, rpe: 5, distanceM: null, durationS: 600, performedAt: at(12), extra: { incompletion_reason: "time_constraints" } },
      ]);
    });

    it("tras purgeHealthData, session_logs.csv sale con rpe y frecuencias vacíos y el resto intacto", async () => {
      const { user, groupSession, individual } = await createFixture();
      await prisma.sessionLog.create({
        data: { sessionId: groupSession.id, athleteId: user.id, completed: true, rpe: 7, distanceM: 10200, durationS: 3600, performedAt: at(11), extra: { avg_heart_rate_bpm: 148, max_heart_rate_bpm: 175 } },
      });
      await prisma.sessionLog.create({
        data: { sessionId: individual.id, athleteId: user.id, completed: false, rpe: 5, durationS: 600, performedAt: at(12), extra: { incompletion_reason: "time_constraints", avg_heart_rate_bpm: 150 } },
      });

      await userRepository.purgeHealthData(user.id);

      const files = await buildExportFiles(user.id, repository, new Date("2026-11-20T10:00:00.000Z"));
      const csv = files!.find((file) => file.name === "session_logs.csv")!.content;
      expect(csv).toBe(
        [
          "session_id,completed,rpe,distance_m,duration_s,performed_at,incompletion_reason,avg_heart_rate_bpm,max_heart_rate_bpm",
          `${groupSession.id},true,,10200,3600,2026-11-11T08:00:00Z,,,`,
          `${individual.id},false,,,600,2026-11-12T08:00:00Z,time_constraints,,`,
          "",
        ].join("\r\n"),
      );
    });

    it("devuelve una lista vacía si no tiene registros", async () => {
      const { user } = await createFixture();

      await expect(repository.findSessionLogs(user.id)).resolves.toEqual([]);
    });
  });

  describe("findMessages", () => {
    const at = (minute: number) => new Date(`2026-11-10T10:${String(minute).padStart(2, "0")}:00.000Z`);

    async function createFixture() {
      const user = await prisma.user.create({ data: { email, nick: "runner" } });
      const other = await prisma.user.create({ data: { email: otherEmail, nick: "other" } });
      const org = await prisma.organization.create({ data: { name: orgName, timezone: "Europe/Madrid" } });
      const event = await prisma.event.create({
        data: { orgId: org.id, title: "Rodaje", location: "Retiro", startsAt: new Date("2030-01-01T10:00:00Z") },
      });
      // She no longer takes part in the DM (removedAt set), but her messages are still hers
      const dm = await prisma.conversation.create({
        data: {
          kind: "dm",
          participants: { create: [{ userId: user.id, removedAt: at(0) }, { userId: other.id }] },
        },
      });
      const eventChat = await prisma.conversation.create({
        data: { kind: "event", eventId: event.id, participants: { create: [{ userId: other.id }] } },
      });
      return { user, other, dm, eventChat };
    }

    it("devuelve todos sus mensajes, en DM y en chats de Event, también si ya no participa, por fecha e id", async () => {
      const { user, dm, eventChat } = await createFixture();
      const second = await prisma.message.create({
        data: { conversationId: eventChat.id, authorId: user.id, body: "en el Event", createdAt: at(20) },
      });
      const first = await prisma.message.create({
        data: { conversationId: dm.id, authorId: user.id, body: "en el DM", createdAt: at(10) },
      });
      const deleted = await prisma.message.create({
        data: { conversationId: dm.id, authorId: user.id, body: "borrado", createdAt: at(30), deletedAt: at(40) },
      });

      await expect(repository.findMessages(user.id)).resolves.toEqual([
        { id: first.id, conversationId: dm.id, kind: "dm", body: "en el DM", createdAt: at(10), deletedAt: null },
        { id: second.id, conversationId: eventChat.id, kind: "event", body: "en el Event", createdAt: at(20), deletedAt: null },
        { id: deleted.id, conversationId: dm.id, kind: "dm", body: "borrado", createdAt: at(30), deletedAt: at(40) },
      ]);
    });

    it("no devuelve mensajes de otras personas ni los que quedaron sin autor", async () => {
      const { user, other, dm, eventChat } = await createFixture();
      const mine = await prisma.message.create({
        data: { conversationId: dm.id, authorId: user.id, body: "mío", createdAt: at(10) },
      });
      await prisma.message.create({
        data: { conversationId: dm.id, authorId: other.id, body: "de otra persona", createdAt: at(11) },
      });
      await prisma.message.create({
        data: { conversationId: eventChat.id, authorId: other.id, body: "de otra persona en el Event", createdAt: at(12) },
      });
      await prisma.message.create({
        data: { conversationId: eventChat.id, authorId: null, body: "sin autor", createdAt: at(13) },
      });

      const messages = await repository.findMessages(user.id);

      expect(messages.map((message) => message.id)).toEqual([mine.id]);
    });

    it("devuelve una lista vacía si no ha escrito mensajes", async () => {
      const { user } = await createFixture();

      await expect(repository.findMessages(user.id)).resolves.toEqual([]);
    });
  });
});
