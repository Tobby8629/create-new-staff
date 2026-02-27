import { Client, Account, Databases, Teams, ID, Query, Permission, Role } from "node-appwrite";

const randomPassword = (len = 24) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

export default async ({ req, res }) => {
  try {
    const body = JSON.parse(req.body || "{}");
    const {
      email,
      firstName,
      lastName,
      username=firstName,
      employeeId,
      departmentId,
      defaultScheduleId,
      defaultShiftId,
      scheduleAnchorDate,
      role = "staff",
    } = body;


    if (!email || !firstName || !lastName || !username || !employeeId) {
      return res.json({ error: "Missing required fields" }, 400);
    }

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const account = new Account(client);
    const db = new Databases(client);
    const teams = new Teams(client);

    // 1) Ensure employeeId is unique
    const existing = await db.listDocuments(
      process.env.DB_ID,
      process.env.COLL_STAFF,
      [Query.equal("employeeId", employeeId)]
    );

    if (existing.total > 0) {
      return res.json({ error: "Employee already exists" }, 409);
    }

    // 2) Create auth user with random temp password
    const tempPassword = randomPassword();

    const authUser = await account.create(
      ID.unique(),
      email,
      tempPassword,
      `${firstName}`
    );

    // // 3) Optional: add admin to admin team
    // if (role === "admin" && process.env.ADMIN_TEAM_ID) {
    //   // Invite by email is most compatible
    //   await teams.createMembership(
    //     process.env.ADMIN_TEAM_ID,
    //     ["admin"],
    //     email,
    //     `${process.env.WEB_APP_URL}/accept-team-invite`
    //   );
    // }

    // 4) Create staff profile (status onboarding)
    const staffProfile = await db.createDocument(
      process.env.DB_ID,
      process.env.COLL_STAFF,
      ID.unique(),
      {
        userId: authUser.$id,
        email,
        firstName,
        lastName,
        username,
        employeeId,
        departmentId: departmentId || null,
        role,
        status: "onboarding",
        defaultScheduleId: defaultScheduleId || null,
        defaultShiftId: defaultShiftId || null,
        scheduleAnchorDate: scheduleAnchorDate || null,
      },
      [
        // Staff can read their own profile
        Permission.read(Role.user(authUser.$id)),

        // Admin team full access
        Permission.read(Role.team("admin")),
        Permission.update(Role.team("admin")),
        Permission.delete(Role.team("admin")),
      ]
    );

    // 5) Send onboarding email (recovery link)
    await account.createRecovery(
      email,
      `${process.env.WEB_APP_URL}/reset-password`
    );

    return res.json({ ok: true, authUserId: authUser.$id, staffDocId: staffProfile.$id });
  } catch (err) {
    return res.json({ error: err.message || "Server error" }, 500);
  }
};