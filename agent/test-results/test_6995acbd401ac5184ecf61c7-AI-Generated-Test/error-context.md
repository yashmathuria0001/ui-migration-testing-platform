# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e4]:
    - text:  You logged into a secure area!
    - link "×" [ref=e5] [cursor=pointer]:
      - /url: "#"
  - generic [ref=e6]:
    - link "Fork me on GitHub":
      - /url: https://github.com/tourdedave/the-internet
      - img "Fork me on GitHub" [ref=e7] [cursor=pointer]
    - generic [ref=e9]:
      - heading "Secure Area" [level=2] [ref=e10]: Secure Area
      - heading "Welcome to the Secure Area. When you are done click logout below." [level=4] [ref=e11]
      - link "Logout" [ref=e12] [cursor=pointer]:
        - /url: /logout
  - generic [ref=e14]:
    - separator [ref=e15]
    - generic [ref=e16]:
      - text: Powered by
      - link "Elemental Selenium" [ref=e17] [cursor=pointer]:
        - /url: http://elementalselenium.com/
```