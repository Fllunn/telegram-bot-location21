import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_URI ?? '', {
      autoIndex: true,
    }),
    TelegramModule,
  ],
})
export class AppModule {}
