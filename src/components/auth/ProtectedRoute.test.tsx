import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "./ProtectedRoute";

const { authState } = vi.hoisted(() => ({
  authState: {
    user: null as { id: string } | null,
    loading: false,
    isAdmin: false,
    isApproved: false,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: () => authState,
}));

function renderProfileRoute() {
  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <Routes>
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <div>Private profile content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/auth" element={<div>Authentication page</div>} />
        <Route path="/awaiting-approval" element={<div>Awaiting approval page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("protected profile route", () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
    authState.isAdmin = false;
    authState.isApproved = false;
  });

  it("does not expose profile content while authentication is loading", () => {
    authState.loading = true;

    const { container } = renderProfileRoute();

    expect(screen.queryByText("Private profile content")).not.toBeInTheDocument();
    expect(container.querySelector(".bg-muted")).toBeInTheDocument();
  });

  it("redirects logged-out users to authentication", () => {
    renderProfileRoute();

    expect(screen.getByText("Authentication page")).toBeInTheDocument();
    expect(screen.queryByText("Private profile content")).not.toBeInTheDocument();
  });

  it("redirects unapproved users to the awaiting-approval page", () => {
    authState.user = { id: "pending-user" };

    renderProfileRoute();

    expect(screen.getByText("Awaiting approval page")).toBeInTheDocument();
    expect(screen.queryByText("Private profile content")).not.toBeInTheDocument();
  });

  it("allows approved users to access their profile", () => {
    authState.user = { id: "approved-user" };
    authState.isApproved = true;

    renderProfileRoute();

    expect(screen.getByText("Private profile content")).toBeInTheDocument();
  });
});
