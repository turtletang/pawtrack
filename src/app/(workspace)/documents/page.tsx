import { requireUser } from "@/lib/server/auth";
import { listDocuments } from "@/lib/server/documents";
import { listPets } from "@/lib/server/pets";
import { DocumentManager } from "@/components/care/documents";
export default async function DocumentsPage() {
  const user = await requireUser(); const [documents, pets] = await Promise.all([listDocuments(user.id), listPets(user.id)]);
  return <DocumentManager documents={documents} pets={pets} />;
}
