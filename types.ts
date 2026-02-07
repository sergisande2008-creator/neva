
export type Category = "Todos" | "Entrante" | "Primero" | "Segundo Carne" | "Segundo Pescado" | "Postre" | "Bebida";

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  description: string;
  category: Category;
  dietTags: string[];
  allergens: string[];
  image: string;
  isChefSuggestion?: boolean;
}

export interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  note?: string;
}

export interface Order {
  id: string;
  table: string;
  items: CartItem[];
  timestamp: string;
  acceptedAt?: string;
  deliveredAt?: string;
  status: 'Nuevo' | 'Cocinando' | 'Completado';
  total: number;
  diners: number;
}

export interface Message {
  role: 'ramiro' | 'user';
  text: string;
}
