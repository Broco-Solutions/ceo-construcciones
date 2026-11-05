// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Combobox, normalizeSearch } from "../components/Combobox";
import { Modal } from "../components/ui";
vi.stubGlobal("React", React);
beforeAll(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
const options = [
  { value: "one", label: "Árbol", description: "CLI-01 · CUIT 1" },
  { value: "two", label: "Árbol", description: "CLI-02 · CUIT 2" },
];
describe("shared combobox", () => {
  it("opens without text, distinguishes homonyms, selects an ID and clears", async () => {
    const change = vi.fn();
    function Field() {
      const [v, setV] = useState("");
      return (
        <Combobox
          label="Cliente"
          value={v}
          options={options}
          onChange={(o) => {
            setV(o?.value ?? "");
            change(o?.value ?? null);
          }}
        />
      );
    }
    render(<Field />);
    fireEvent.click(screen.getByRole("button", { name: "Desplegar opciones" }));
    await screen.findAllByRole("option");
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(change).toHaveBeenLastCalledWith("one");
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe(
      "Árbol",
    );
    fireEvent.click(screen.getByRole("button", { name: "Limpiar campo" }));
    expect(change).toHaveBeenLastCalledWith(null);
  });
  it("Escape closes the options before a containing modal; typing never creates a valid ID", async () => {
    const close = vi.fn(),
      change = vi.fn();
    render(
      <Modal open onClose={close} title="Formulario">
        <Combobox label="Obra" options={options} onChange={change} required />
      </Modal>,
    );
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    await screen.findAllByRole("option");
    fireEvent.change(input, { target: { value: "texto sin entidad" } });
    expect(change).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).validationMessage).not.toBe("");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("finds later pages and discards out-of-order remote responses", async () => {
    let release: ((v: any) => void) | undefined;
    const loader = vi.fn(async (q: string, page: number) =>
      q === "old"
        ? new Promise<any>((r) => {
            release = r;
          })
        : {
            options: [{ value: q + page, label: q || "Página " + page }],
            total: page === 1 ? 2 : 2,
          },
    );
    render(
      <Combobox label="Material" onChange={() => {}} loadOptions={loader} />,
    );
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    await screen.findByText("Página 1");
    fireEvent.click(
      screen.getByRole("button", { name: "Cargar más opciones" }),
    );
    await screen.findByText("Página 2");
    await new Promise(r=>setTimeout(r,260));
    expect(screen.queryByText("Página 2")).not.toBeNull();
    fireEvent.change(input, { target: { value: "old" } });
    await waitFor(() =>
      expect(loader).toHaveBeenCalledWith("old", 1, expect.anything()),
    );
    fireEvent.change(input, { target: { value: "new" } });
    await screen.findByText("new");
    release?.({ options: [{ value: "stale", label: "stale" }], total: 1 });
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText("stale")).toBeNull();
  });
  it("returns focus without reopening and reopens a focused selected field by click", async () => {
    function Field() {
      const [value, setValue] = useState("");
      return (
        <Combobox
          label="Cliente"
          value={value}
          options={options}
          onChange={(o) => setValue(o?.value ?? "")}
        />
      );
    }
    render(<Field />);
    const input = screen.getByRole("combobox");
    fireEvent.click(input);
    const choices = await screen.findAllByRole("option");
    (input as HTMLInputElement).blur();
    fireEvent.click(choices[0]);
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(input);
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });
  it("shares accent, case and whitespace normalization", () => {
    expect(normalizeSearch("  ÁRBOL   Ñandú ")).toBe("arbol nandu");
  });
});
