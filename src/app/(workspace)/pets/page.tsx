import { PetManager } from "@/components/pet-manager";
import { requireUser } from "@/lib/server/auth";
import { listPets } from "@/lib/server/pets";
export default async function PetsPage() {
  const user = await requireUser();
  return <PetManager pets={await listPets(user.id)} />;
}
