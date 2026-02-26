import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

type Contact = {
  id: number;
  phoneNumber: string | null;
  email: string | null;
  linkedId: number | null;
  linkPrecedence: "primary" | "secondary";
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type ContactClient = {
  findUnique(args: { where: { id: number } }): Promise<Contact | null>;
  findMany(args: { where: unknown; orderBy?: { createdAt: "asc" } }): Promise<Contact[]>;
  create(args: {
    data: {
      email: string | null;
      phoneNumber: string | null;
      linkedId?: number;
      linkPrecedence: "primary" | "secondary";
    };
  }): Promise<Contact>;
  update(args: {
    where: { id: number };
    data: {
      linkedId?: number;
      linkPrecedence?: "primary" | "secondary";
    };
  }): Promise<Contact>;
  updateMany(args: {
    where: { linkedId: number };
    data: { linkedId: number };
  }): Promise<{ count: number }>;
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to initialize Prisma client");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const { PrismaClient } = require("@prisma/client") as {
  PrismaClient: new (options: { adapter: PrismaPg }) => { contact: ContactClient };
};
const prisma = new PrismaClient({ adapter });

interface IdentifyResponse {
  contact: {
    primaryContatctId: number;
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
  };
}

/**
 * Finds the root primary contact by following the linkedId chain upward.
 */
async function findPrimaryContact(contact: Contact): Promise<Contact> {
  let current = contact;
  while (current.linkedId !== null) {
    const parent = await prisma.contact.findUnique({
      where: { id: current.linkedId },
    });
    if (!parent) break;
    current = parent;
  }
  return current;
}

/**
 * Gathers the primary contact and all its secondary contacts,
 * then formats the consolidated response.
 */
async function buildResponse(primaryContact: Contact): Promise<IdentifyResponse> {
  const secondaryContacts = await prisma.contact.findMany({
    where: { linkedId: primaryContact.id },
    orderBy: { createdAt: "asc" },
  });

  const emails: string[] = [];
  const phoneNumbers: string[] = [];
  const secondaryContactIds: number[] = [];

  if (primaryContact.email) emails.push(primaryContact.email);
  if (primaryContact.phoneNumber) phoneNumbers.push(primaryContact.phoneNumber);

  for (const sc of secondaryContacts) {
    secondaryContactIds.push(sc.id);
    if (sc.email && !emails.includes(sc.email)) emails.push(sc.email);
    if (sc.phoneNumber && !phoneNumbers.includes(sc.phoneNumber))
      phoneNumbers.push(sc.phoneNumber);
  }

  return {
    contact: {
      primaryContatctId: primaryContact.id,
      emails,
      phoneNumbers,
      secondaryContactIds,
    },
  };
}

/**
 * Core identity reconciliation logic.
 *
 * 1. No matches found → create a new primary contact.
 * 2. Matches all resolve to the same primary → create secondary if new info exists.
 * 3. Matches resolve to different primaries → merge by turning the newer primary
 *    into a secondary of the older one, and re-link its children.
 */
export async function identifyContact(
  email: string | null,
  phoneNumber: string | null
): Promise<IdentifyResponse> {
  const conditions = [];
  if (email) conditions.push({ email });
  if (phoneNumber) conditions.push({ phoneNumber });

  const matchingContacts = await prisma.contact.findMany({
    where: { OR: conditions },
    orderBy: { createdAt: "asc" },
  });

  // --- Case 1: No existing contacts match ---
  if (matchingContacts.length === 0) {
    const newContact = await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkPrecedence: "primary",
      },
    });
    return buildResponse(newContact);
  }

  // Resolve every matched contact to its root primary
  const primarySet = new Map<number, Contact>();
  for (const c of matchingContacts) {
    const primary = await findPrimaryContact(c);
    primarySet.set(primary.id, primary);
  }

  const primaries = [...primarySet.values()].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  // The oldest primary is the canonical one
  const canonicalPrimary = primaries[0];

  // --- Case 3: Multiple distinct primaries → merge them ---
  if (primaries.length > 1) {
    for (let i = 1; i < primaries.length; i++) {
      const otherPrimary = primaries[i];

      // Demote the newer primary to secondary under the canonical primary
      await prisma.contact.update({
        where: { id: otherPrimary.id },
        data: {
          linkedId: canonicalPrimary.id,
          linkPrecedence: "secondary",
        },
      });

      // Re-parent all children of the demoted primary
      await prisma.contact.updateMany({
        where: { linkedId: otherPrimary.id },
        data: { linkedId: canonicalPrimary.id },
      });
    }
  }

  // --- Case 2: Check if request brings new information ---
  const allLinked = await prisma.contact.findMany({
    where: {
      OR: [{ id: canonicalPrimary.id }, { linkedId: canonicalPrimary.id }],
    },
  });

  const existingEmails = new Set(allLinked.map((c) => c.email).filter(Boolean));
  const existingPhones = new Set(
    allLinked.map((c) => c.phoneNumber).filter(Boolean)
  );

  const hasNewEmail = email !== null && !existingEmails.has(email);
  const hasNewPhone = phoneNumber !== null && !existingPhones.has(phoneNumber);

  if (hasNewEmail || hasNewPhone) {
    await prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkedId: canonicalPrimary.id,
        linkPrecedence: "secondary",
      },
    });
  }

  return buildResponse(canonicalPrimary);
}
