export type HouseResident = {
  id: string;
  resident_name: string;
  resident_phone: string | null;
};

export type HouseWithResidents = {
  id: string;
  house_number: string;
  house_name: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  condo_house_residents: HouseResident[];
};
