export interface RegisterRequest {
  username: string;
  password: string;
  nickname: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface AuthResponse {
  user: {
    id: number;
    username: string;
    nickname: string;
  };
}

export interface AuthError {
  message: string;
  field?: string;
}
