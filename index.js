// import { Client, Account, Databases, Teams, ID, Query, Permission, Role } from "node-appwrite";

// const randomPassword = (len = 24) => {
//   const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
//   return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
// };

// export default async ({ req, res }) => {
//   try {
//     const body = JSON.parse(req.body || "{}");
//     const {
//       email,
//       firstName,
//       lastName,
//       username=firstName,
//       employeeId,
//       unitId,
//       departmentId,
//       defaultScheduleId,
//       defaultShiftId,
//       scheduleAnchorDate,
//       role = "staff",
//     } = body;


//     if (!email || !firstName || !lastName || !username || !employeeId) {
//       return res.json({ error: "Missing required fields" }, 400);
//     }

//     const client = new Client()
//       .setEndpoint(process.env.APPWRITE_ENDPOINT)
//       .setProject(process.env.APPWRITE_PROJECT_ID)
//       .setKey(process.env.APPWRITE_API_KEY);

//     const account = new Account(client);
//     const db = new Databases(client);
//     const teams = new Teams(client);

//     // 1) Ensure employeeId is unique
//     const existing = await db.listDocuments(
//       process.env.DB_ID,
//       process.env.COLL_STAFF,
//       [Query.equal("employeeId", employeeId)]
//     );

//     if (existing.total > 0) {
//       return res.json({ error: "Employee already exists" }, 409);
//     }

//     // 2) Create auth user with random temp password
//     const tempPassword = randomPassword();

//     const authUser = await account.create(
//       ID.unique(),
//       email,
//       tempPassword,
//       `${firstName}`
//     );

//     // 3) Optional: add supervisor to admin team
//     if (role === "supervisor" && process.env.ADMIN_TEAM_ID) {
//       // Invite by email is most compatible
//       await teams.createMembership(
//         process.env.ADMIN_TEAM_ID,
//         ["admin"],
//         email,
//         `${process.env.WEB_APP_URL}/accept-team-invite`
//       );
//     }

//     // 4) Create staff profile (status onboarding)
//     const staffProfile = await db.createDocument(
//       process.env.DB_ID,
//       process.env.COLL_STAFF,
//       ID.unique(),
//       {
//         userId: authUser.$id,
//         email,
//         firstName,
//         lastName,
//         unitId,
//         employeeId,
//         departmentId: departmentId || null,
//         role,
//         status: "onboarding",
//         defaultScheduleId: defaultScheduleId || null,
//         defaultShiftId: defaultShiftId || null,
//         scheduleAnchorDate: scheduleAnchorDate || null,
//       },
//       [
//         // Staff can read their own profile
//         Permission.read(Role.user(authUser.$id)),

//         // Admin team full access
//         Permission.read(Role.team("admin")),
//         Permission.update(Role.team("admin")),
//         Permission.delete(Role.team("admin")),
//       ]
//     );

//     // 5) Send onboarding email (recovery link)
//     await account.createRecovery(
//       email,
//       `${process.env.WEB_APP_URL}/reset-password`
//     );

//     return res.json({ ok: true, authUserId: authUser.$id, staffDocId: staffProfile.$id });
//   } catch (err) {
//     return res.json({ error: err.message || "Server error" }, 500);
//   }
// };


import {
  Client,
  Users,
  Databases,
  Teams,
  ID,
  Query,
  Permission,
  Role,
} from "node-appwrite";

const randomPassword = (len = 24) => {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from(
    { length: len },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
};

const parseBody = (body) => {
  try {
    if (!body) return {};
    return typeof body === "string" ? JSON.parse(body) : body;
  } catch {
    return {};
  }
};

const normalizeRole = (teamName = "") => teamName.trim().toLowerCase();

export default async ({ req, res, log, error }) => {
  let createdUserId = null;

  try {
    const body = parseBody(req.body);

    const {
      email,
      firstName,
      lastName,
      username,
      employeeId,
      unitId,
      departmentId,
      defaultScheduleId,
      defaultShiftId,
      scheduleAnchorDate,
      roleId, // existing team id from frontend
    } = body;

    const normalizedEmail = email?.trim().toLowerCase();
    const trimmedFirstName = firstName?.trim();
    const trimmedLastName = lastName?.trim();
    const trimmedEmployeeId = employeeId?.trim();

    const safeUsername =
      username?.trim() ||
      `${trimmedFirstName || ""} ${trimmedLastName || ""}`.trim() ||
      normalizedEmail;

    if (
      !normalizedEmail ||
      !trimmedFirstName ||
      !trimmedLastName ||
      !trimmedEmployeeId ||
      !roleId
    ) {
      return res.json(
        {
          ok: false,
          message:
            "email, firstName, lastName, employeeId, and roleId are required",
        },
        400
      );
    }

    const client = new Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT)
      .setProject(process.env.APPWRITE_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY);

    const users = new Users(client);
    const db = new Databases(client);
    const teams = new Teams(client);

    const DB_ID = process.env.DB_ID;
    const STAFF_COLLECTION_ID = process.env.COLL_STAFF;
    const WEB_APP_URL = process.env.WEB_APP_URL;
    const ADMIN_TEAM_ID = process.env.ADMIN_TEAM_ID;

    if (!DB_ID || !STAFF_COLLECTION_ID || !WEB_APP_URL) {
      return res.json(
        {
          ok: false,
          message:
            "Missing required environment variables: DB_ID, COLL_STAFF, or WEB_APP_URL",
        },
        500
      );
    }

    // 1. Ensure employeeId is unique
    const existingEmployee = await db.listDocuments(
      DB_ID,
      STAFF_COLLECTION_ID,
      [Query.equal("employeeId", trimmedEmployeeId)]
    );

    if (existingEmployee.total > 0) {
      return res.json(
        { ok: false, message: "Employee ID already exists" },
        409
      );
    }

    // 2. Ensure email is unique in staff collection
    const existingEmail = await db.listDocuments(DB_ID, STAFF_COLLECTION_ID, [
      Query.equal("email", normalizedEmail),
    ]);

    if (existingEmail.total > 0) {
      return res.json(
        { ok: false, message: "Email already exists" },
        409
      );
    }

    // 3. Get the existing team and derive role from team name
    let team;
    try {
      team = await teams.get(roleId);
    } catch (teamErr) {
      return res.json(
        {
          ok: false,
          message: "Invalid roleId. Team not found.",
        },
        404
      );
    }

    const teamName = team?.name?.trim() || "Staff";
    const resolvedRole = normalizeRole(teamName); // e.g. "supervisor"
    const roleLabel = teamName; // e.g. "Supervisor"

    // 4. Create auth user
    const tempPassword = randomPassword();

    const authUser = await users.create(
      ID.unique(),
      normalizedEmail,
      undefined,
      tempPassword,
      `${trimmedFirstName} ${trimmedLastName}`.trim()
    );

    createdUserId = authUser.$id;

    // 5. Add user to existing team
    // user may need to accept invite depending on your Appwrite setup
  // 5. Add existing auth user to existing team
    await teams.createMembership(
      roleId,
      [],
      undefined,
      authUser.$id
    );

    // 6. Create staff profile
    const staffProfile = await db.createDocument(
      DB_ID,
      STAFF_COLLECTION_ID,
      ID.unique(),
      {
        userId: authUser.$id,
        email: normalizedEmail,
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        username: safeUsername,
        employeeId: trimmedEmployeeId,

        unitId: unitId || null,
        departmentId: departmentId || null,

        roleId, // existing team id
        role: resolvedRole, // normalized team name
        roleLabel, // original team name

        status: "onboarding",
        defaultScheduleId: defaultScheduleId || null,
        defaultShiftId: defaultShiftId || null,
        scheduleAnchorDate: scheduleAnchorDate || null,
      },
      [
        Permission.read(Role.user(authUser.$id)),
        Permission.update(Role.user(authUser.$id)),

        Permission.read(Role.team(roleId)),

        ...(ADMIN_TEAM_ID
          ? [
              Permission.read(Role.team(ADMIN_TEAM_ID)),
              Permission.update(Role.team(ADMIN_TEAM_ID)),
              Permission.delete(Role.team(ADMIN_TEAM_ID)),
            ]
          : []),
      ]
    );

    // 7. Send onboarding / password setup email
    await account.createRecovery({
      email: normalizedEmail,
      url: `${WEB_APP_URL}/reset-password`,
    });
    return res.json(
      {
        ok: true,
        message: "Staff created successfully",
        data: {
          authUserId: authUser.$id,
          staffDocId: staffProfile.$id,
          roleId,
          role: resolvedRole,
          roleLabel,
        },
      },
      201
    );
  } catch (err) {
    // rollback auth user if staff doc creation failed after user creation
    if (createdUserId) {
      try {
        const rollbackClient = new Client()
          .setEndpoint(process.env.APPWRITE_ENDPOINT)
          .setProject(process.env.APPWRITE_PROJECT_ID)
          .setKey(process.env.APPWRITE_API_KEY);

        const rollbackUsers = new Users(rollbackClient);
        await rollbackUsers.delete(createdUserId);
      } catch (rollbackErr) {
        log?.(
          `Rollback failed for user ${createdUserId}: ${
            rollbackErr?.message || rollbackErr
          }`
        );
      }
    }

    error?.(`createStaff error: ${err?.message || err}`);

    return res.json(
      {
        ok: false,
        message: err?.message || "Server error",
      },
      500
    );
  }
};