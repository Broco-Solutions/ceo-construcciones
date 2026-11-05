// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { DataTable } from "../components/ui";
import { api } from "../lib/api";
vi.stubGlobal("React", React);
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  api: { post: vi.fn(), download: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const rows = [
    { id: "a", name: "Uno" },
    { id: "b", name: "Dos" },
  ],
  columns = [
    {
      key: "name",
      header: "Nombre",
      render: (r: (typeof rows)[number]) => r.name,
    },
  ];
describe("selección estable de tablas", () => {
  it("página, todos, exclusión y móvil no abren ficha; exportación usa token y filtros exactos", async () => {
    const post = vi.mocked(api.post);
    post.mockResolvedValue({
      data: {
        token: "snapshot",
        rows: [...rows, { id: "c", name: "Tres" }],
        total: 3,
        expiresInSeconds: 1800,
      },
    });
    const open = vi.fn(),
      collection = {
        resource: "clients",
        filters: { q: "consulta" },
        total: 3,
      };
    const { container, rerender } = render(
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={open}
        mobile={(r) => <b>{r.name}</b>}
        collection={collection}
      />,
    );
    fireEvent.click(screen.getByLabelText("Seleccionar página visible"));
    await waitFor(() =>
      expect(screen.getByText(/2 seleccionados/)).toBeTruthy(),
    );
    expect(open).not.toHaveBeenCalled();
    expect(post.mock.calls[0][1]).toMatchObject({
      resource: "clients",
      filters: { q: "consulta" },
      ids: ["a", "b"],
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Seleccionar los 3 resultados de este filtro",
      }),
    );
    await waitFor(() =>
      expect(screen.getByText(/3 seleccionados/)).toBeTruthy(),
    );
    fireEvent.click(container.querySelector(".mcards input")!);
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText(/2 seleccionados/)).toBeTruthy();
    rerender(
      <DataTable
        rows={[{ id: "c", name: "Tres" }]}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={open}
        collection={collection}
      />,
    );
    expect(
      (screen.getByLabelText("Seleccionar fila Tres") as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Exportar seleccionados" }),
    );
    await waitFor(() => expect(api.download).toHaveBeenCalled());
    expect(vi.mocked(api.download).mock.calls[0][4]).toEqual({
      token: "snapshot",
      ids: ["b", "c"],
    });
    rerender(
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        collection={{ ...collection, filters: { q: "otra" } }}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/La selección se limpió porque cambiaron/),
      ).toBeTruthy(),
    );
    expect(
      screen.queryByRole("button", { name: "Exportar seleccionados" }),
    ).toBeNull();
  });
  it("checks immediately during server validation and rolls back a rejected selection", async () => {
    let reject!: (error: Error) => void;
    vi.mocked(api.post).mockReturnValue(
      new Promise((_, r) => {
        reject = r;
      }),
    );
    render(
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        collection={{ resource: "clients", total: 2 }}
      />,
    );
    const checkbox = screen.getByLabelText(
      "Seleccionar página visible",
    ) as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    expect(checkbox.disabled).toBe(true);
    reject(new Error("Conflicto"));
    await screen.findByRole("alert");
    expect(checkbox.checked).toBe(false);
    expect(checkbox.disabled).toBe(false);
  });
  it("rechazo del servidor conserva el error y no inventa selección", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("El registro cambió"));
    render(
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        collection={{ resource: "clients", total: 2 }}
      />,
    );
    fireEvent.click(screen.getByLabelText("Seleccionar fila Uno"));
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Exportar seleccionados" }),
    ).toBeNull();
  });
});
