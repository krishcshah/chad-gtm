import { describe, expect, it } from "vitest";
import { STANDARD_LEAD_FIELDS } from "@smartreach/shared";
import { autoMapHeaders, guessField, parseCsvText, scoreEmailHeader } from "../csv";

const fields = STANDARD_LEAD_FIELDS as unknown as { key: string; label: string }[];

describe("guessField email headers", () => {
  it.each(["email", "Email", "EMAIL", "e-mail", "E-mail", "E-Mail", "Email Address", "email address", "EmailAddress"])(
    "maps %j to email",
    (header) => {
      expect(guessField(header, fields)).toBe("email");
      expect(scoreEmailHeader(header)).toBeGreaterThanOrEqual(2);
    },
  );

  it("maps a BOM-prefixed Email header", () => {
    expect(guessField("\uFEFFEmail", fields)).toBe("email");
    expect(guessField("\uFEFFEmail Address", fields)).toBe("email");
  });

  it("prefers a real email column over a status column", () => {
    expect(guessField("Email Status", fields)).toBeNull();
    expect(guessField("Work Email", fields)).toBe("email");
  });

  it("still maps the other standard headers", () => {
    expect(guessField("First Name", fields)).toBe("first_name");
    expect(guessField("Company Name", fields)).toBe("company");
    expect(guessField("Job Title", fields)).toBe("job_title");
  });
});

describe("autoMapHeaders", () => {
  it("preselects Email Address and leaves unrelated columns unmapped", () => {
    const mapped = autoMapHeaders(["Company", "Email Address", "Notes"], fields);
    expect(mapped["Email Address"]).toBe("email");
    expect(mapped.Company).toBe("company");
    expect(mapped.Notes).toBeNull();
  });

  it("preselects e-mail and a BOM email column from the middle of a wide header row", () => {
    const headers = ["id", "source", "e-mail", ...Array.from({ length: 30 }, (_, i) => `extra_${i}`)];
    expect(autoMapHeaders(headers, fields)["e-mail"]).toBe("email");

    const bom = autoMapHeaders(["\uFEFFEmail", "Company"], fields);
    expect(bom["\uFEFFEmail"]).toBe("email");
  });

  it("keeps the strongest email header when several look similar", () => {
    const mapped = autoMapHeaders(["Work Email", "Email Status", "Email"], fields);
    expect(mapped.Email).toBe("email");
    expect(mapped["Work Email"]).toBeNull();
    expect(mapped["Email Status"]).toBeNull();
  });
});

describe("parseCsvText", () => {
  it("strips a leading BOM so the first header can auto-map", () => {
    const parsed = parseCsvText("\uFEFFEmail Address,Company\nada@example.com,Acme\n");
    expect(parsed.headers).toEqual(["Email Address", "Company"]);
    expect(parsed.rows).toEqual([{ "Email Address": "ada@example.com", Company: "Acme" }]);
    expect(guessField(parsed.headers[0]!, fields)).toBe("email");
  });

  it("keeps quoted commas inside a cell", () => {
    const parsed = parseCsvText('email,company\n"ada@example.com","Acme, Inc"\n');
    expect(parsed.rows[0]).toEqual({ email: "ada@example.com", company: "Acme, Inc" });
  });
});
