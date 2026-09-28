export class CreateUserDTO {
  constructor({ name, email, image, oauth, method, device, isLogin, idToken }) {
    this.name = name;
    this.email = email;
    this.image = image;
    this.oauth = oauth;
    this.method = method;
    this.device = device;
    this.isLogin = isLogin;
    this.idToken = idToken;
  }
}

export class VerifyUserDTO {
  constructor({ email, otp, device }) {
    this.email = email;
    this.otp = otp;
    this.device = device;
  }
}
