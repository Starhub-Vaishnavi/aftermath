import * as currency from "../utils/currency";
import { taxFor } from "../lib/tax";

export default function AdminRefunds() {
  const refund = (input: string) => currency.parseAmount(input) - taxFor("CA", input);
  return <button onClick={() => refund("10.00")}>Refund</button>;
}
