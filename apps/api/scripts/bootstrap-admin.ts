import { Role } from "@prisma/client";
import { db, transaction } from "../src/core/db";
import { hashPassword } from "../src/core/auth";

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !name || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error(
      "Configure BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME y BOOTSTRAP_ADMIN_PASSWORD en un entorno seguro.",
    );
  const passwordHash = await hashPassword(password);
  await transaction(async (tx) => {
    if ((await tx.user.count()) !== 0)
      throw new Error(
        "Bootstrap permitido únicamente sobre una base sin usuarios. Use administración de usuarios.",
      );
    const user = await tx.user.create({
      data: { email, name, passwordHash, role: Role.GERENCIA },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "BOOTSTRAP_ADMIN",
        entityType: "User",
        entityId: user.id,
      },
    });
  });
  console.info(
    "Administrador inicial creado. Quite las variables BOOTSTRAP_ADMIN_* del entorno.",
  );
}
main()
  .catch(() => {
    console.error(
      "No se pudo crear administrador. Verifique entorno, contraseña de 8–128 caracteres y base vacía.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
