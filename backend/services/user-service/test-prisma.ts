import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PostRepository } from './src/modules/user/post.repository';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const repo = app.get(PostRepository);
  
  try {
    console.log('Testing feed...');
    const result = await repo.listFriendsFeedPosts('user1', 0, 20);
    console.log('Success:', result);
  } catch (e) {
    console.error('Feed error:', e);
  }

  try {
    console.log('Testing comments...');
    const result = await repo.listPostComments('m1', 0, 20);
    console.log('Success:', result);
  } catch (e) {
    console.error('Comments error:', e);
  }

  await app.close();
}
bootstrap();
