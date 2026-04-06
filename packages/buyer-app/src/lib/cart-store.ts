"use client";

import { createContext, useContext, useCallback, useSyncExternalStore } from "react";

export interface CartItem {
  itemId: string;
  providerId: string;
  bppId: string;
  bppUri: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  domain?: string;
}

interface CartState {
  items: CartItem[];
  transactionId?: string;
}

type Listener = () => void;

const STORAGE_KEY = "ondc_cart";

function getInitialState(): CartState {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted storage, reset
  }
  return { items: [] };
}

let state: CartState = getInitialState();
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full, ignore
  }
}

function getSnapshot(): CartState {
  return state;
}

function getServerSnapshot(): CartState {
  return { items: [] };
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function addToCart(item: Omit<CartItem, "quantity">, quantity = 1) {
  const existing = state.items.find(
    (i) => i.itemId === item.itemId && i.providerId === item.providerId && i.bppId === item.bppId
  );
  if (existing) {
    state = {
      ...state,
      items: state.items.map((i) =>
        i.itemId === item.itemId && i.providerId === item.providerId && i.bppId === item.bppId
          ? { ...i, quantity: i.quantity + quantity }
          : i
      ),
    };
  } else {
    state = { ...state, items: [...state.items, { ...item, quantity }] };
  }
  persist();
  emit();
}

export function updateQuantity(itemId: string, providerId: string, bppId: string, quantity: number) {
  if (quantity <= 0) {
    removeFromCart(itemId, providerId, bppId);
    return;
  }
  state = {
    ...state,
    items: state.items.map((i) =>
      i.itemId === itemId && i.providerId === providerId && i.bppId === bppId
        ? { ...i, quantity }
        : i
    ),
  };
  persist();
  emit();
}

export function removeFromCart(itemId: string, providerId: string, bppId: string) {
  state = {
    ...state,
    items: state.items.filter(
      (i) => !(i.itemId === itemId && i.providerId === providerId && i.bppId === bppId)
    ),
  };
  persist();
  emit();
}

export function clearCart() {
  state = { items: [] };
  persist();
  emit();
}

export function setTransactionId(txnId: string) {
  state = { ...state, transactionId: txnId };
  persist();
  emit();
}

export function useCart() {
  const cart = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = cart.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return {
    items: cart.items,
    transactionId: cart.transactionId,
    totalItems,
    subtotal,
    addToCart: useCallback(
      (item: Omit<CartItem, "quantity">, qty?: number) => addToCart(item, qty),
      []
    ),
    updateQuantity: useCallback(
      (itemId: string, providerId: string, bppId: string, qty: number) =>
        updateQuantity(itemId, providerId, bppId, qty),
      []
    ),
    removeFromCart: useCallback(
      (itemId: string, providerId: string, bppId: string) =>
        removeFromCart(itemId, providerId, bppId),
      []
    ),
    clearCart: useCallback(() => clearCart(), []),
    setTransactionId: useCallback((id: string) => setTransactionId(id), []),
  };
}

export const CartContext = createContext<ReturnType<typeof useCart> | null>(null);

export function useCartContext() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCartContext must be used within CartProvider");
  return ctx;
}
