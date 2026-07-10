import { createUser, listUsers } from "./routes/users.js";
import { login, whoami, logout } from "./routes/sessions.js";
import { logRequest } from "./middleware/logger.js";
import { toErrorResponse } from "./middleware/errorHandler.js";

export const routes = {
  createUser,
  listUsers,
  login,
  whoami,
  logout,
};

export { logRequest, toErrorResponse };
