import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { JwtStrategy } from '../../shared/auth/jwt.strategy';
import { EventBusService } from '../../shared/events/event-bus.service';
import { AuthServiceClient } from '../../shared/clients/auth-service.client';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';
import { UserService } from './user.service';
import { PostRepository } from './post.repository';
import { PostService } from './post.service';
import { CloudinaryService } from './cloudinary.service';

@Module({
  imports: [PrismaModule, PassportModule, JwtModule.register({})],
  controllers: [UserController],
  providers: [
    // User domain
    UserService,
    UserRepository,
    // Post domain
    PostService,
    PostRepository,
    // Shared
    JwtStrategy,
    EventBusService,
    AuthServiceClient,
    CloudinaryService,
  ],
})
export class UserModule {}
