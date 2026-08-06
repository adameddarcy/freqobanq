# freqobanq

## Sample data

```ts
interface Trade {
  id: string;
  quantity: number;
  speed: number; // execution speed in seconds, nanosecond precision, < 0.000001
  profit: number;
}
```

```json
[
  { "id": "T-1001", "quantity": 250, "speed": 0.000000184, "profit": 12.45 },
  { "id": "T-1002", "quantity": 1000, "speed": 0.000000092, "profit": -3.10 },
  { "id": "T-1003", "quantity": 75, "speed": 0.000000402, "profit": 5.02 },
  { "id": "T-1004", "quantity": 500, "speed": 0.000000064, "profit": 21.77 },
  { "id": "T-1005", "quantity": 10, "speed": 0.000000728, "profit": -0.85 }
]
```
# Question

Given a list of trade objects.
Write a feature that calculates the 
1. total profit
2. avg profit
3. total speed
4. avg speed