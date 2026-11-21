// @vitest-environment node
import { describe, expect, it } from "vitest";
import { neutralizeCell, toCsv } from "@/lib/gdpr/export/csv";

describe("neutralizeCell", () => {
  it.each([
    ["=", "=SUM(A1)"],
    ["+", "+34600000000"],
    ["-", "-1+1"],
    ["@", "@user"],
    ["tabulador", "\tcmd"],
    ["retorno de carro", "\rcmd"],
  ])("antepone una comilla simple si el texto empieza por %s", (_name, value) => {
    expect(neutralizeCell(value)).toBe(`'${value}`);
  });

  it("deja igual el texto que no empieza por un prefijo de fórmula", () => {
    expect(neutralizeCell("Llego en 5 minutos")).toBe("Llego en 5 minutos");
    expect(neutralizeCell("a=b")).toBe("a=b");
    expect(neutralizeCell("")).toBe("");
  });
});

describe("toCsv", () => {
  it("escribe la cabecera y las filas separadas por CRLF", () => {
    expect(toCsv(["a", "b"], [["1", "2"], ["3", "4"]])).toBe("a,b\r\n1,2\r\n3,4\r\n");
  });

  it("escribe solo la cabecera si no hay filas", () => {
    expect(toCsv(["a", "b"], [])).toBe("a,b\r\n");
  });

  it("entrecomilla las celdas con comas, comillas o saltos de línea", () => {
    expect(toCsv(["body"], [["uno, dos"]])).toBe('body\r\n"uno, dos"\r\n');
    expect(toCsv(["body"], [['dijo "hola"']])).toBe('body\r\n"dijo ""hola"""\r\n');
    expect(toCsv(["body"], [["línea 1\nlínea 2"]])).toBe('body\r\n"línea 1\nlínea 2"\r\n');
    expect(toCsv(["body"], [["línea 1\r\nlínea 2"]])).toBe('body\r\n"línea 1\r\nlínea 2"\r\n');
  });

  it("deja vacía la celda de un valor ausente", () => {
    expect(toCsv(["a", "b", "c"], [["x", null, undefined]])).toBe("a,b,c\r\nx,,\r\n");
  });

  it("escribe números y booleanos sin comillas ni neutralizar", () => {
    expect(toCsv(["n", "neg", "ok"], [[10000, -5, true]])).toBe("n,neg,ok\r\n10000,-5,true\r\n");
  });

  it("neutraliza las celdas de texto con prefijo de fórmula", () => {
    expect(toCsv(["body"], [["=1+1"], ["+1"], ["-1"], ["@x"]])).toBe("body\r\n'=1+1\r\n'+1\r\n'-1\r\n'@x\r\n");
  });

  it("neutraliza antes de entrecomillar", () => {
    expect(toCsv(["body"], [['=HYPERLINK("http://x.test","a")']])).toBe(
      'body\r\n"\'=HYPERLINK(""http://x.test"",""a"")"\r\n',
    );
  });

  it("entrecomilla el texto que empieza por tabulador o retorno de carro tras neutralizarlo", () => {
    expect(toCsv(["body"], [["\tcmd"]])).toBe("body\r\n'\tcmd\r\n");
    expect(toCsv(["body"], [["\rcmd"]])).toBe('body\r\n"\'\rcmd"\r\n');
  });
});
