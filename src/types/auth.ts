/** 当前登录用户的最小公开信息，绝不包含密码或密码哈希。 */
export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  /** 旧账号可继续使用邮箱登录；普通用户名不会在界面展示内部邮箱。 */
  email?: string;
}

/** 持久化到小程序本地的登录会话。 */
export interface AuthSession {
  token: string;
  user: AuthUser;
  loginTime: number;
  expireTime: number;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type?: string;
  user_id: string;
  expires_in: number;
}

export interface RegisterResponse {
  success: boolean;
  needs_email_confirmation: boolean;
  access_token?: string | null;
  token_type?: string;
  user_id?: string | null;
  expires_in?: number | null;
  message: string;
}
