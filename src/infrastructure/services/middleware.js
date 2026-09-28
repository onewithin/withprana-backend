import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import { PrismaUserRepository } from "../../infrastructure/databases/postgres/userRepository.js";
import { prisma } from "../../config/database.js";

export async function authMiddleware(req, res) {
  const userRepository = new PrismaUserRepository(prisma);
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.code(401).send({ message: "Authorization header missing" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.code(401).send({ message: "Not authorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user;

    if (decoded.isSuper !== undefined) {
      // Admin Logic
      user = await prisma.admin.findUnique({
        where: { id: decoded.id },
      });

      if (!user) {
        return res.code(401).send({ message: "Admin not found" });
      }

      if (user.active === false) {
        return res.code(403).send({ message: "Admin account is inactive" });
      }
    } else {
      // User Logic
      user = await userRepository.findById(decoded.id);

      if (!user) {
        return res.code(401).send({ message: "User not found" });
      }

      if (user.active === false) {
        return res.code(403).send({ message: "User account is inactive" });
      }
    }

    req.user = user;

    if (typeof req.body === "object" && req.body !== null) {
      req.body.email = user.email;
      // req.body.name = user.name; // user.name might not exist on admin
      req.body.user = user;
    } else {
      req.body = {
        email: user.email,
        user: user,
      };
    }
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    return res.code(403).send({ message: "Invalid or expired token" });
  }
}
