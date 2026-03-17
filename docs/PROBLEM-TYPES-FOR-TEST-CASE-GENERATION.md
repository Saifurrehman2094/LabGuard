# Problem Types for Test Case Generation

## Works Well
- **Simple math** – factorial, GCD, prime, sum
- **1D arrays** – max, sum, reverse
- **Strings** – palindrome, reverse, count
- **Basic loops** – print 1 to n, FizzBuzz
- **Pattern problems** – star/number/character triangles, pyramids, diamonds
- **Recursion** – factorial, Fibonacci, power, tower of Hanoi
- **Conditionals / switch** – grade classifier, menu-driven, if-else chains
- **Pointers (C/C++)** – swap via pointer, pointer arithmetic
- **Do-while loops** – repeat-until style problems

## May Need Review
- 2D arrays, graphs, multiple test cases in one run
- **Validation problems** (username, password, format rules) – AI may print "Input: X, Expected Output: Y" instead of just the result. Use manual workflow.
- **3D arrays** – generation works but verify expected outputs manually.

## Multi-line Output Note
Pattern problems and 2D/nested-loop problems produce multi-line output (e.g. `"1\n2 2\n3 3 3"`).
- The system stores and compares the **raw `\n`-separated string** — grading is correct.
- The test case table shows `↵` in the compact preview (e.g. `1 ↵ 2 2 ↵ 3 3 3`).
- Click a test case card and expand it to see the full multi-line output exactly as stored.
- If an existing question has collapsed single-line outputs (e.g. `1 2 2 3 3 3` instead of three lines), use the **Fix Pattern Outputs** button on that question to re-run Judge0 and correct them automatically.

## Use Manual Workflow (Paste solution + Fill)
- OOP / banking / class-based
- Long scenario-based (parking, billing, inventory)

## Rule of Thumb
**Simple problem = usually works** (AI infers format from common patterns). **Complex (OOP, long scenario) = paste solution and fill.** For best results, a brief example in the problem helps, but it's not required.
