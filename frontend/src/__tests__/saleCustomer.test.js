import { describe, expect, it } from "vitest";
import { matchCustomers, quickCustomerPayload } from "../saleCustomer";

const customers = [
  { id: "1", name: "María López", phone: "664 123 4567" },
  { id: "2", name: "Beto", phone: "" },
  { id: "3", name: "Doña Mary", phone: "(664) 555-0000" },
];

describe("matchCustomers", () => {
  it("busca por nombre sin acentos ni mayúsculas", () => {
    expect(matchCustomers(customers, "maria").map((c) => c.id)).toEqual(["1"]);
    expect(matchCustomers(customers, "MARY").map((c) => c.id)).toEqual(["3"]);
  });
  it("busca por teléfono con 3 dígitos o más, sin importar el formato", () => {
    expect(matchCustomers(customers, "5550").map((c) => c.id)).toEqual(["3"]);
    expect(matchCustomers(customers, "66").map((c) => c.id)).toEqual([]);
  });
  it("sin texto no ofrece a nadie y respeta el tope", () => {
    expect(matchCustomers(customers, "  ")).toEqual([]);
    expect(matchCustomers(customers, "a", 1)).toHaveLength(1);
  });
});

describe("quickCustomerPayload", () => {
  it("un nombre se guarda como nombre", () => {
    expect(quickCustomerPayload("  Don Pepe ")).toEqual({ name: "Don Pepe" });
  });
  it("un teléfono se guarda como teléfono", () => {
    expect(quickCustomerPayload("664 123 4567")).toEqual({ name: "Cliente 4567", phone: "664 123 4567" });
  });
  it("vacío no crea nada", () => {
    expect(quickCustomerPayload("   ")).toBeNull();
  });
});
