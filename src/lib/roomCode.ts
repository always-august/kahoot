/** 헷갈리는 0,O,1,I 를 뺀 방 코드 알파벳 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 6;

/**
 * 사용 중이 아닌 방 코드를 만든다.
 * @param taken 이미 쓰고 있는 코드인지 판별하는 함수
 */
export function generateRoomCode(taken: (code: string) => boolean): string {
  let code = "";
  do {
    code = "";
    for (let i = 0; i < CODE_LEN; i++) {
      // Math.random 은 이벤트 코드 용도로 충분
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
  } while (taken(code));
  return code;
}
