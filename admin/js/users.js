import { $, clearStatus, escapeHtml, setStatus } from "./dom.js";
import { ensureInitialized } from "./parseClient.js";
import { canMutate, requireGlobalAdmin } from "./permissions.js";
import { state } from "./state.js";

export function renderUserList() {
  const userList = $("userList");
  userList.innerHTML = "";

  if (!state.users.length) {
    userList.innerHTML = `<div class="empty-state">No users found.</div>`;
    return;
  }

  state.users.forEach(user => {
    const div = document.createElement("div");
    div.className = "user-item";
    const username = user.get("username") || "Unknown";
    const role = user.get("role") || "institution_user";
    const isAdmin = username === "admin" || role === "global_admin";
    const deleteAction = canMutate()
      ? (!isAdmin ? `<button class="danger small" data-user-id="${user.id}">Delete</button>` : '<span class="small">Cannot delete admin</span>')
      : '<span class="small">Read-only</span>';

    div.innerHTML = `
      <div class="user-info">
        <div class="user-name">${escapeHtml(username)}</div>
        <div class="user-role">${escapeHtml(role)}</div>
      </div>
      <div class="actions">
        ${deleteAction}
      </div>
    `;
    userList.appendChild(div);
  });

  userList.querySelectorAll("button[data-user-id]").forEach(btn => {
    btn.addEventListener("click", () => deleteUser(btn.dataset.userId));
  });
}

export async function refreshUsers() {
  try {
    ensureInitialized();
    clearStatus($("userListStatus"));
    const query = new Parse.Query(Parse.User);
    query.ascending("username");
    state.users = await query.find();

    renderUserList();
    setStatus($("userListStatus"), `Loaded ${state.users.length} user${state.users.length === 1 ? "" : "s"}.`);
  } catch (error) {
    setStatus($("userListStatus"), error.message || String(error), "error");
  }
}

export async function createUser() {
  try {
    ensureInitialized();
    clearStatus($("userCreateStatus"));
    if (!requireGlobalAdmin($("userCreateStatus"))) return;

    const username = $("newUsername").value.trim();
    const password = $("newPassword").value;
    const confirmPassword = $("confirmPassword").value;
    const role = $("userRole").value;

    if (!username || !password) {
      throw new Error("Username and password are required.");
    }

    if (password !== confirmPassword) {
      throw new Error("Passwords do not match.");
    }

    const user = new Parse.User();
    user.set("username", username);
    user.set("password", password);
    user.set("role", role);

    await user.signUp();

    $("newUsername").value = "";
    $("newPassword").value = "";
    $("confirmPassword").value = "";
    $("userRole").value = "institution_user";

    setStatus($("userCreateStatus"), `User created: ${username}`);
    await refreshUsers();
  } catch (error) {
    setStatus($("userCreateStatus"), error.message || String(error), "error");
  }
}

async function deleteUser(userId) {
  try {
    ensureInitialized();
    if (!requireGlobalAdmin($("userListStatus"))) return;

    const confirmDelete = confirm("Are you sure you want to delete this user? This cannot be undone.");
    if (!confirmDelete) return;

    const user = state.users.find(u => u.id === userId);
    if (!user) return;

    const username = user.get("username");
    const role = user.get("role");

    if (username === "admin" || role === "global_admin") {
      throw new Error("Cannot delete admin users.");
    }

    await user.destroy();

    setStatus($("userListStatus"), `User deleted: ${username}`);
    await refreshUsers();
  } catch (error) {
    setStatus($("userListStatus"), error.message || String(error), "error");
  }
}
