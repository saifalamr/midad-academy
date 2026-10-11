'use client';
import { useParams } from 'next/navigation';
import HomeworkWorkspace from '@/components/HomeworkWorkspace';
export default function HomeworkPage(){const {sessionId}=useParams<{sessionId:string}>();return <HomeworkWorkspace sessionId={sessionId}/>;}
