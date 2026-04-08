// import {
//   Client,
//   Users,
//   Databases,
//   Teams,
//   ID,
//   Query,
//   Permission,
//   Account,
//   Role,
// } from "node-appwrite";

// const randomPassword = (len = 24) => {
//   const chars =
//     "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
//   return Array.from(
//     { length: len },
//     () => chars[Math.floor(Math.random() * chars.length)]
//   ).join("");
// };

// const parseBody = (body) => {
//   try {
//     if (!body) return {};
//     return typeof body === "string" ? JSON.parse(body) : body;
//   } catch {
//     return {};
//   }
// };

// const normalizeRole = (teamName = "") => teamName.trim().toLowerCase();

// export default async ({ req, res, log, error }) => {
//   let createdUserId = null;

//   try {
//     const body = parseBody(req.body);

//     const {
//       email,
//       firstName,
//       lastName,
//       username,
//       employeeId,
//       unitId,
//       departmentId,
//       defaultScheduleId,
//       defaultShiftId,
//       scheduleAnchorDate,
//       roleId, // existing team id from frontend
//     } = body;

//     const normalizedEmail = email?.trim().toLowerCase();
//     const trimmedFirstName = firstName?.trim();
//     const trimmedLastName = lastName?.trim();
//     const trimmedEmployeeId = employeeId?.trim();

//     const safeUsername =
//       username?.trim() ||
//       `${trimmedFirstName || ""} ${trimmedLastName || ""}`.trim() ||
//       normalizedEmail;

//     if (
//       !normalizedEmail ||
//       !trimmedFirstName ||
//       !trimmedLastName ||
//       !trimmedEmployeeId ||
//       !roleId
//     ) {
//       return res.json(
//         {
//           ok: false,
//           message:
//             "email, firstName, lastName, employeeId, and roleId are required",
//         },
//         400
//       );
//     }

//     const client = new Client()
//       .setEndpoint(process.env.APPWRITE_ENDPOINT)
//       .setProject(process.env.APPWRITE_PROJECT_ID)
//       .setKey(process.env.APPWRITE_API_KEY);

//     const users = new Users(client);
//     const db = new Databases(client);
//     const teams = new Teams(client);
//     const account = new Account(client); 

//     const DB_ID = process.env.DB_ID;
//     const STAFF_COLLECTION_ID = process.env.COLL_STAFF;
//     const WEB_APP_URL = process.env.WEB_APP_URL;
//     const ADMIN_TEAM_ID = process.env.ADMIN_TEAM_ID;

//     if (!DB_ID || !STAFF_COLLECTION_ID || !WEB_APP_URL) {
//       return res.json(
//         {
//           ok: false,
//           message:
//             "Missing required environment variables: DB_ID, COLL_STAFF, or WEB_APP_URL",
//         },
//         500
//       );
//     }

//     // 1. Ensure employeeId is unique
//     const existingEmployee = await db.listDocuments(
//       DB_ID,
//       STAFF_COLLECTION_ID,
//       [Query.equal("employeeId", trimmedEmployeeId)]
//     );

//     if (existingEmployee.total > 0) {
//       return res.json(
//         { ok: false, message: "Employee ID already exists" },
//         409
//       );
//     }

//     // 2. Ensure email is unique in staff collection
//     const existingEmail = await db.listDocuments(DB_ID, STAFF_COLLECTION_ID, [
//       Query.equal("email", normalizedEmail),
//     ]);

//     if (existingEmail.total > 0) {
//       return res.json(
//         { ok: false, message: "Email already exists" },
//         409
//       );
//     }

//     // 3. Get the existing team and derive role from team name
//     let team;
//     try {
//       team = await teams.get(roleId);
//     } catch (teamErr) {
//       return res.json(
//         {
//           ok: false,
//           message: "Invalid roleId. Team not found.",
//         },
//         404
//       );
//     }

//     const teamName = team?.name?.trim() || "Staff";
//     const resolvedRole = normalizeRole(teamName); // e.g. "supervisor"
//     const roleLabel = teamName; // e.g. "Supervisor"

//     // 4. Create auth user
//     const tempPassword = randomPassword();

//     const authUser = await users.create(
//       ID.unique(),
//       normalizedEmail,
//       undefined,
//       tempPassword,
//       `${trimmedFirstName} ${trimmedLastName}`.trim()
//     );

//     createdUserId = authUser.$id;

//     // 5. Add user to existing team
//     // user may need to accept invite depending on your Appwrite setup
//   // 5. Add existing auth user to existing team
//     await teams.createMembership(
//       roleId,
//       [],
//       undefined,
//       authUser.$id
//     );

//     // 6. Create staff profile
//     const staffProfile = await db.createDocument(
//       DB_ID,
//       STAFF_COLLECTION_ID,
//       ID.unique(),
//       {
//         userId: authUser.$id,
//         email: normalizedEmail,
//         firstName: trimmedFirstName,
//         lastName: trimmedLastName,
//         username: safeUsername,
//         employeeId: trimmedEmployeeId,

//         unitId: unitId || null,
//         departmentId: departmentId || null,

//         roleId, // existing team id
//         role: resolvedRole, // normalized team name
//         roleLabel, // original team name

//         status: "onboarding",
//         defaultScheduleId: defaultScheduleId || null,
//         defaultShiftId: defaultShiftId || null,
//         scheduleAnchorDate: scheduleAnchorDate || null,
//       },
//       [
//         Permission.read(Role.user(authUser.$id)),
//         Permission.update(Role.user(authUser.$id)),

//         Permission.read(Role.team(roleId)),

//         ...(ADMIN_TEAM_ID
//           ? [
//               Permission.read(Role.team(ADMIN_TEAM_ID)),
//               Permission.update(Role.team(ADMIN_TEAM_ID)),
//               Permission.delete(Role.team(ADMIN_TEAM_ID)),
//             ]
//           : []),
//       ]
//     );

//     // 7. Send onboarding / password setup email
//    await account.createRecovery(normalizedEmail, `${WEB_APP_URL}/reset-password`);
//     return res.json(
//       {
//         ok: true,
//         message: "Staff created successfully",
//         data: {
//           authUserId: authUser.$id,
//           staffDocId: staffProfile.$id,
//           roleId,
//           role: resolvedRole,
//           roleLabel,
//         },
//       },
//       201
//     );
//   } catch (err) {
//     // rollback auth user if staff doc creation failed after user creation
//     if (createdUserId) {
//       try {
//         const rollbackClient = new Client()
//           .setEndpoint(process.env.APPWRITE_ENDPOINT)
//           .setProject(process.env.APPWRITE_PROJECT_ID)
//           .setKey(process.env.APPWRITE_API_KEY);

//         const rollbackUsers = new Users(rollbackClient);
//         await rollbackUsers.delete(createdUserId);
//       } catch (rollbackErr) {
//         log?.(
//           `Rollback failed for user ${createdUserId}: ${
//             rollbackErr?.message || rollbackErr
//           }`
//         );
//       }
//     }

//     error?.(`createStaff error: ${err?.message || err}`);

//     return res.json(
//       {
//         ok: false,
//         message: err?.message || "Server error",
//       },
//       500
//     );
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
  Account,
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
  let createdStaffDocId = null;
  let createdMembershipId = null;
  let createdTeamId = null;

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const users = new Users(client);
  const db = new Databases(client);
  const teams = new Teams(client);
  const account = new Account(client);

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
      gender,
      defaultShiftId,
      scheduleAnchorDate,
      roleId,
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

    // 3. Validate team and derive role
    let team;
    try {
      team = await teams.get(roleId);
    } catch {
      return res.json(
        { ok: false, message: "Invalid roleId. Team not found." },
        404
      );
    }

    const teamName = team?.name?.trim() || "Staff";
    const resolvedRole = normalizeRole(teamName);
    const roleLabel = teamName;

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
    log?.(`Created auth user: ${createdUserId}`);

    // 5. Add existing user to team
    const membership = await teams.createMembership(
      roleId,
      [],
      undefined,
      authUser.$id
    );

    createdMembershipId = membership?.$id || membership?.id || null;
    createdTeamId = roleId;

    log?.(
      `Created membership: ${createdMembershipId || "unknown"} for team ${roleId}`
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
        gender: gender || null,
        unitId: unitId || null,
        departmentId: departmentId || null,
        roleId,
        role: resolvedRole,
        roleLabel,
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

    createdStaffDocId = staffProfile.$id;
    log?.(`Created staff document: ${createdStaffDocId}`);

    // 7. Send onboarding / password setup email
    await account.createRecovery(
      normalizedEmail,
      `${WEB_APP_URL}/reset-password`
    );

    return res.json(
      {
        ok: true,
        message: "Staff created successfully",
        data: {
          authUserId: authUser.$id,
          staffDocId: staffProfile.$id,
          membershipId: createdMembershipId,
          roleId,
          role: resolvedRole,
          roleLabel,
        },
      },
      201
    );
  } catch (err) {
    error?.(`createStaff error: ${err?.message || err}`);

    const rollbackErrors = [];

    // Roll back in reverse order of creation

    if (createdStaffDocId) {
      try {
        await db.deleteDocument(
          process.env.DB_ID,
          process.env.COLL_STAFF,
          createdStaffDocId
        );
        log?.(`Rollback: deleted staff document ${createdStaffDocId}`);
      } catch (rollbackErr) {
        rollbackErrors.push(
          `Failed to delete staff doc ${createdStaffDocId}: ${
            rollbackErr?.message || rollbackErr
          }`
        );
      }
    }

    if (createdMembershipId && createdTeamId) {
      try {
        await teams.deleteMembership(createdTeamId, createdMembershipId);
        log?.(
          `Rollback: deleted membership ${createdMembershipId} from team ${createdTeamId}`
        );
      } catch (rollbackErr) {
        rollbackErrors.push(
          `Failed to delete membership ${createdMembershipId}: ${
            rollbackErr?.message || rollbackErr
          }`
        );
      }
    }

    if (createdUserId) {
      try {
        await users.delete(createdUserId);
        log?.(`Rollback: deleted auth user ${createdUserId}`);
      } catch (rollbackErr) {
        rollbackErrors.push(
          `Failed to delete auth user ${createdUserId}: ${
            rollbackErr?.message || rollbackErr
          }`
        );
      }
    }

    return res.json(
      {
        ok: false,
        message: err?.message || "Server error",
        rollbackOk: rollbackErrors.length === 0,
        rollbackErrors,
      },
      500
    );
  }
};